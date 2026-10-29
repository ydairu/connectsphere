// SPM-19 — Attendee registration.
//
// Who may register, when registration is open and what a registration records are decided only by
// shared/registration.js. This file loads what those rules need — the event, its active registrations and its
// approved venues — and writes the registration, the lock and the Attendee's notice in one transaction.
//
// Concurrency: each registration reads and writes systemLocks/registration-{eventId} in the same transaction
// (the SPM-8 / SPM-62 pattern), so two Attendees cannot both take an event's last place. A Firestore query in a
// transaction does not lock documents created after it runs; the shared lock document does.

import { registrationConfirmedNotifications } from '../../../shared/notifications.js'
import {
  NOT_ATTENDEE,
  REGISTRATIONS_COLLECTION,
  UNAVAILABLE_MESSAGES,
  buildRegistration,
  canRegister,
  canViewRegistrations,
  isActiveRegistration,
  presentOwnRegistration,
  presentRegistrant,
  registrationId,
  venueCapacityOf,
  effectiveCapacity,
} from '../../../shared/registration.js'
import { BOOKING_APPROVED, currentVenueBookingGroups, effectiveVenueBookingStatus } from '../../../shared/venueBooking.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { EventRequestForbiddenError, EventRequestNotFoundError } from './eventRequestService.js'
import { addNotifications } from './notificationService.js'
import { requireRequestScope } from './statusTransitionService.js'
import { BOOKINGS } from './venueBookingService.js'

export class RegistrationError extends Error {
  constructor(status, reason) {
    super(UNAVAILABLE_MESSAGES[reason] ?? 'Registration is not available.')
    this.name = 'RegistrationError'
    this.status = status
    this.reason = reason
  }
}

const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const read = (tx, refOrQuery) => (tx ? tx.get(refOrQuery) : refOrQuery.get())

/**
 * The event's approved venues ({ venueName, maximumCapacity }): the current booking of each venue need, when it
 * is approved — the same selection as SPM-66's safety review. Reads inside `tx` when one is given.
 */
export async function loadApprovedVenues(db, eventId, now = new Date(), tx = null) {
  const bookings = rows(await read(tx, db.collection(BOOKINGS).where('eventRequestId', '==', eventId)))
  const approved = currentVenueBookingGroups(bookings)
    .map((group) => group.current)
    .filter((booking) => effectiveVenueBookingStatus(booking, now) === BOOKING_APPROVED)
  return Promise.all(approved.map(async (booking) => {
    const venue = booking.venueId ? await read(tx, db.collection('venues').doc(booking.venueId)) : null
    const data = venue?.exists ? venue.data() : null
    return { venueName: booking.venueName ?? data?.name ?? null, maximumCapacity: data?.maximumCapacity ?? null }
  }))
}

const venueNamesOf = (venues) => venues.map((venue) => venue.venueName).filter(Boolean)

async function loadActiveRegistrations(db, eventId, tx = null) {
  return rows(await read(tx, db.collection(REGISTRATIONS_COLLECTION).where('eventRequestId', '==', eventId))).filter(isActiveRegistration)
}

/**
 * What the event page needs to tell this user about registration: the active count, the venue capacity and
 * names, and the user's own registration. Read outside any transaction; the register transaction re-reads it all.
 */
export async function loadRegistrationContext(db, event, user, now = new Date()) {
  const [venues, active, own] = await Promise.all([
    loadApprovedVenues(db, event.id, now),
    loadActiveRegistrations(db, event.id),
    user?.uid ? db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(event.id, user.uid)).get() : null,
  ])
  return {
    registeredCount: active.length,
    venueCapacity: venueCapacityOf(venues),
    venueNames: venueNamesOf(venues),
    existing: own?.exists ? own.data() : null,
    now,
  }
}

/**
 * Registers `user` for event `id` and returns { registration } as the Attendee sees it. Out of scope: the
 * SPM-42/65 refusal (404 for a Coordinator, 403 otherwise). Not an Attendee: RegistrationError 403. Registration
 * unavailable, already registered or full: RegistrationError 409 with the reason. Nothing is written on refusal.
 */
export async function registerForEvent(id, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(eventRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const event = { id, ...snapshot.data() }
    requireRequestScope(user, event)

    const lockRef = db.collection('systemLocks').doc(`registration-${id}`)
    const registrationRef = db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(id, user.uid))
    await tx.get(lockRef)
    const existing = await tx.get(registrationRef)
    const active = await loadActiveRegistrations(db, id, tx)
    const venues = await loadApprovedVenues(db, id, now, tx)

    const decision = canRegister(user, event, {
      existing: existing.exists ? existing.data() : null,
      registeredCount: active.length,
      venueCapacity: venueCapacityOf(venues),
      now,
    })
    if (!decision.allowed) throw new RegistrationError(decision.reason === NOT_ATTENDEE ? 403 : 409, decision.reason)

    const at = now.toISOString()
    const registration = buildRegistration(event, user, { venueNames: venueNamesOf(venues), at })
    tx.set(registrationRef, registration)
    tx.set(lockRef, { eventRequestId: id, registeredCount: active.length + 1, updatedAt: at })
    addNotifications(tx, db, registrationConfirmedNotifications(event, user, { venueNames: registration.venueNames, at }))
    return { registration: presentOwnRegistration(registration) }
  })
}

/** The signed-in Attendee's registrations, soonest event first. The uid comes from the verified token. */
export async function listMyRegistrations(user, db = getAdminDb()) {
  const snapshot = await db.collection(REGISTRATIONS_COLLECTION).where('attendeeUid', '==', user.uid).get()
  return rows(snapshot)
    .map(presentOwnRegistration)
    .sort((a, b) => String(a.eventStartsAt).localeCompare(String(b.eventStartsAt)))
}

/**
 * The registered list for event `id` (D3): the owning Organiser and the assigned Coordinator only. Out of scope:
 * the SPM-42/65 refusal; in scope but not one of those two (a colleague, staff, an Attendee): 403.
 */
export async function listEventRegistrations(id, user, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const event = { id, ...snapshot.data() }
  requireRequestScope(user, event)
  if (!canViewRegistrations(user, event)) throw new EventRequestForbiddenError()

  const [active, venues] = await Promise.all([loadActiveRegistrations(db, id), loadApprovedVenues(db, id, now)])
  return {
    registeredCount: active.length,
    capacity: effectiveCapacity(event.registration ?? {}, venueCapacityOf(venues)),
    registrations: active.sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt))).map(presentRegistrant),
  }
}
