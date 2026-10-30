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
  WAITLISTED,
  buildWaitlistEntry,
  canJoinWaitingList,
  waitingListCount,
  waitingListPosition,
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
    return { bookingId: booking.id, venueName: booking.venueName ?? data?.name ?? null, maximumCapacity: data?.maximumCapacity ?? null }
  }))
}

const venueNamesOf = (venues) => venues.map((venue) => venue.venueName).filter(Boolean)

// SPM-90: once a primary venue is selected, it alone determines the Attendee's venue and venue capacity.
// A stale selection must not expose a different approved venue as the event location.
export function registrationVenueContext(event, approvedVenues) {
  const venues = event.primaryVenue?.bookingId
    ? approvedVenues.filter((venue) => venue.bookingId === event.primaryVenue.bookingId)
    : approvedVenues
  return { venueCapacity: venueCapacityOf(venues), venueNames: venueNamesOf(venues) }
}

// Every registration record of the event: registered, and (SPM-39) waitlisted.
async function loadEventEntries(db, eventId, tx = null) {
  return rows(await read(tx, db.collection(REGISTRATIONS_COLLECTION).where('eventRequestId', '==', eventId)))
}

async function loadActiveRegistrations(db, eventId, tx = null) {
  return (await loadEventEntries(db, eventId, tx)).filter(isActiveRegistration)
}

/**
 * What the event page needs to tell this user about registration: the active count, the effective venue capacity
 * and names, and the user's own registration. Read outside any transaction; the register transaction re-reads it all.
 */
export async function loadRegistrationContext(db, event, user, now = new Date()) {
  const [venues, entries, own] = await Promise.all([
    loadApprovedVenues(db, event.id, now),
    loadEventEntries(db, event.id),
    user?.uid ? db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(event.id, user.uid)).get() : null,
  ])
  const venue = registrationVenueContext(event, venues)
  return {
    registeredCount: entries.filter(isActiveRegistration).length,
    ...venue,
    existing: own?.exists ? own.data() : null,
    // SPM-39: the Attendee's place on the waiting list, when they are on it.
    waitingListPosition: user?.uid ? waitingListPosition(entries, user.uid) : null,
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
    const venue = registrationVenueContext(event, venues)

    const decision = canRegister(user, event, {
      existing: existing.exists ? existing.data() : null,
      registeredCount: active.length,
      venueCapacity: venue.venueCapacity,
      now,
    })
    if (!decision.allowed) throw new RegistrationError(decision.reason === NOT_ATTENDEE ? 403 : 409, decision.reason)

    const at = now.toISOString()
    const registration = buildRegistration(event, user, { venueNames: venue.venueNames, at })
    tx.set(registrationRef, registration)
    tx.set(lockRef, { eventRequestId: id, registeredCount: active.length + 1, updatedAt: at })
    addNotifications(tx, db, registrationConfirmedNotifications(event, user, { venueNames: registration.venueNames, at }))
    return { registration: presentOwnRegistration(registration) }
  })
}

/**
 * SPM-39 — puts `user` on event `id`'s waiting list and returns { registration } as the Attendee sees it, with their
 * position. The same transaction and lock as registering, so the event cannot gain a free place, or another
 * Attendee join, between the check and the write: the queue order is the order of these transactions (W3), taken
 * from the lock's `waitlistSequence` counter. Refusals as for registering, with `not_full` (a place is free:
 * register instead) and `already_waitlisted`. Nothing is written on refusal.
 */
export async function joinWaitingList(id, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(eventRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const event = { id, ...snapshot.data() }
    requireRequestScope(user, event)

    const lockRef = db.collection('systemLocks').doc(`registration-${id}`)
    const entryRef = db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(id, user.uid))
    const lock = await tx.get(lockRef)
    const existing = await tx.get(entryRef)
    const entries = await loadEventEntries(db, id, tx)
    const venues = await loadApprovedVenues(db, id, now, tx)
    const venue = registrationVenueContext(event, venues)

    const decision = canJoinWaitingList(user, event, {
      existing: existing.exists ? existing.data() : null,
      registeredCount: entries.filter(isActiveRegistration).length,
      venueCapacity: venue.venueCapacity,
      now,
    })
    if (!decision.allowed) throw new RegistrationError(decision.reason === NOT_ATTENDEE ? 403 : 409, decision.reason)

    const at = now.toISOString()
    const waitlistSequence = (lock.exists ? lock.data().waitlistSequence ?? 0 : 0) + 1
    const entry = buildWaitlistEntry(event, user, { venueNames: venue.venueNames, waitlistSequence, at })
    tx.set(entryRef, entry)
    tx.set(lockRef, { ...(lock.exists ? lock.data() : {}), eventRequestId: id, waitlistSequence, updatedAt: at })
    const position = waitingListPosition([...entries, { ...entry }], user.uid)
    return { registration: presentOwnRegistration(entry, null, { waitingListPosition: position }) }
  })
}

/**
 * The signed-in Attendee's registrations, soonest event first. The uid comes from the verified token. SPM-41: each
 * is shown with its event as it now is — rescheduled, back in Planning or cancelled — even when the Attendee can no
 * longer open the event itself; presentOwnRegistration() sends only the event's title, time and status.
 */
export async function listMyRegistrations(user, db = getAdminDb()) {
  const snapshot = await db.collection(REGISTRATIONS_COLLECTION).where('attendeeUid', '==', user.uid).get()
  const registrations = rows(snapshot)
  const events = await Promise.all(registrations.map((record) => db.collection('eventRequests').doc(record.eventRequestId).get()))
  // SPM-39: a waitlisted entry's position needs the rest of that event's queue.
  const queues = await Promise.all(registrations.map((record) => (record.status === WAITLISTED ? loadEventEntries(db, record.eventRequestId) : [])))
  return registrations
    .map((record, index) => presentOwnRegistration(record, events[index].exists ? events[index].data() : null, {
      waitingListPosition: waitingListPosition(queues[index], user.uid),
    }))
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

  const [entries, venues] = await Promise.all([loadEventEntries(db, id), loadApprovedVenues(db, id, now)])
  const active = entries.filter(isActiveRegistration)
  return {
    registeredCount: active.length,
    // SPM-39: how many are waiting for a place.
    waitingListCount: waitingListCount(entries),
    capacity: effectiveCapacity(event.registration ?? {}, registrationVenueContext(event, venues).venueCapacity),
    registrations: active.sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt))).map(presentRegistrant),
  }
}
