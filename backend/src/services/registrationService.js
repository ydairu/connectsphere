// SPM-19 — Attendee registration.
//
// Who may register, when registration is open and what a registration records are decided only by
// shared/registration.js. This file loads what those rules need — the event, its active registrations and its
// approved venues — and writes the registration, the lock and the Attendee's notice in one transaction.
//
// Concurrency: each registration reads and writes systemLocks/registration-{eventId} in the same transaction
// (the SPM-8 / SPM-62 pattern), so two Attendees cannot both take an event's last place. A Firestore query in a
// transaction does not lock documents created after it runs; the shared lock document does.
//
// SPM-59: every change — register, join, withdraw, leave, accept, decline — runs in registrationTransaction(),
// which brings the waiting list up to date (settleWaitingList) before and after the change: lapsed invitations
// expire and freed places go to the next people waiting, by invitation. Reads settle too (settleEventRegistrations),
// because there is no background job (X5).

import { registrationConfirmedNotifications, waitingListInvitationNotifications } from '../../../shared/notifications.js'
import {
  DECLINED,
  INVITED,
  NOT_ATTENDEE,
  REGISTERED,
  REGISTRATIONS_COLLECTION,
  UNAVAILABLE_MESSAGES,
  WAITLISTED,
  WITHDRAWN,
  buildRegistration,
  buildWaitlistEntry,
  canJoinWaitingList,
  canLeaveWaitingList,
  canRegister,
  canRespondToInvitation,
  canViewRegistrations,
  canWithdraw,
  effectiveCapacity,
  isActiveRegistration,
  isOpenInvitation,
  placesHeld,
  presentOwnRegistration,
  presentRegistrant,
  registrationId,
  settleWaitingList,
  venueCapacityOf,
  waitingListCount,
  waitingListPosition,
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

// Every registration record of the event: registered, waitlisted, invited, withdrawn, declined or lapsed.
async function loadEventEntries(db, eventId, tx = null) {
  return rows(await read(tx, db.collection(REGISTRATIONS_COLLECTION).where('eventRequestId', '==', eventId)))
}

function withChanges(entries, updates) {
  const byUid = new Map(updates.map((update) => [update.attendeeUid, update.changes]))
  return entries.map((entry) => (byUid.has(entry.attendeeUid) ? { ...entry, ...byUid.get(entry.attendeeUid) } : entry))
}

/**
 * The locked transaction every registration change runs in. Reads the event (with the SPM-42/65 scope refusal), the
 * lock, the event's records and its approved venues; settles the waiting list; asks `decide` for the user's change;
 * settles again, so a place the change freed goes to the next person waiting; then writes the user's record, every
 * settled change, the invitation notices and the lock. `decide` receives the settled state and returns
 * { record, notices?, lock? }, or throws RegistrationError to refuse, in which case nothing is written.
 */
async function registrationTransaction(id, user, db, now, decide) {
  // Settled in its own transaction first, so a refused change cannot roll back an invitation that is due (X6).
  await settleEventRegistrations(db, id, now)
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(eventRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const event = { id, ...snapshot.data() }

    const lockRef = db.collection('systemLocks').doc(`registration-${id}`)
    const lockSnapshot = await tx.get(lockRef)
    const lock = lockSnapshot.exists ? lockSnapshot.data() : {}
    const entries = await loadEventEntries(db, id, tx)
    // SPM-42/65 scope, except for an Attendee who already has a record here: they may still withdraw or answer an
    // invitation after the event leaves their view (an SPM-10 change moves it back to Planning).
    if (!entries.some((entry) => entry.attendeeUid === user.uid)) requireRequestScope(user, event)
    const venue = registrationVenueContext(event, await loadApprovedVenues(db, id, now, tx))
    const at = now.toISOString()

    const before = settleWaitingList(event, entries, { venueCapacity: venue.venueCapacity, now })
    let current = withChanges(entries, before.updates)
    const existing = current.find((entry) => entry.attendeeUid === user.uid) ?? null
    const outcome = decide({ event, current, existing, venue, lock, at })
    current = [...current.filter((entry) => entry.attendeeUid !== user.uid), outcome.record]
    const after = settleWaitingList(event, current, { venueCapacity: venue.venueCapacity, now })
    current = withChanges(current, after.updates)

    const ownRef = db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(id, user.uid))
    tx.set(ownRef, current.find((entry) => entry.attendeeUid === user.uid))
    writeSettled(tx, db, event, current, [...before.updates, ...after.updates].filter((update) => update.attendeeUid !== user.uid), [...before.invited, ...after.invited], at)
    addNotifications(tx, db, outcome.notices ?? [])
    tx.set(lockRef, { ...lock, ...(outcome.lock ?? {}), eventRequestId: id, updatedAt: at })
    const own = current.find((entry) => entry.attendeeUid === user.uid)
    return { registration: presentOwnRegistration(own, null, { waitingListPosition: waitingListPosition(current, user.uid) }) }
  })
}

// Writes each settled record in full, and notifies each newly invited Attendee (AC3).
function writeSettled(tx, db, event, current, updates, invited, at) {
  for (const uid of new Set(updates.map((update) => update.attendeeUid))) {
    tx.set(db.collection(REGISTRATIONS_COLLECTION).doc(registrationId(event.id, uid)), current.find((entry) => entry.attendeeUid === uid))
  }
  for (const entry of invited) {
    const latest = current.find((item) => item.attendeeUid === entry.attendeeUid)
    if (latest?.status === INVITED) addNotifications(tx, db, waitingListInvitationNotifications(event, latest, { at }))
  }
}

/**
 * SPM-59 (X5): brings event `id`'s waiting list up to date — lapsed invitations expire, freed places are offered — and
 * writes only when something changed. Called before reads, since nothing else runs on a timer.
 */
export async function settleEventRegistrations(db, id, now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(eventRef)
    if (!snapshot.exists) return
    const event = { id, ...snapshot.data() }
    const lockRef = db.collection('systemLocks').doc(`registration-${id}`)
    const lockSnapshot = await tx.get(lockRef)
    const entries = await loadEventEntries(db, id, tx)
    const venue = registrationVenueContext(event, await loadApprovedVenues(db, id, now, tx))
    const settled = settleWaitingList(event, entries, { venueCapacity: venue.venueCapacity, now })
    if (settled.updates.length === 0) return
    const at = now.toISOString()
    writeSettled(tx, db, event, withChanges(entries, settled.updates), settled.updates, settled.invited, at)
    tx.set(lockRef, { ...(lockSnapshot.exists ? lockSnapshot.data() : {}), eventRequestId: id, updatedAt: at })
  })
}

/**
 * What the event page needs to tell this user about registration: the places held, the effective venue capacity and
 * names, the user's own record and (SPM-39) waiting-list position. Settles the waiting list first (SPM-59, X5).
 */
export async function loadRegistrationContext(db, event, user, now = new Date()) {
  await settleEventRegistrations(db, event.id, now)
  const [venues, entries] = await Promise.all([loadApprovedVenues(db, event.id, now), loadEventEntries(db, event.id)])
  return {
    registeredCount: placesHeld(entries, now),
    ...registrationVenueContext(event, venues),
    existing: entries.find((entry) => entry.attendeeUid === user?.uid) ?? null,
    waitingListPosition: user?.uid ? waitingListPosition(entries, user.uid) : null,
    now,
  }
}

const refuseWith = (decision) => {
  throw new RegistrationError(decision.reason === NOT_ATTENDEE ? 403 : 409, decision.reason)
}

/**
 * Registers `user` for event `id` and returns { registration } as the Attendee sees it. Out of scope: the
 * SPM-42/65 refusal (404 for a Coordinator, 403 otherwise). Not an Attendee: RegistrationError 403. Registration
 * unavailable, already registered, invited (SPM-59: accept instead) or full: RegistrationError 409 with the reason.
 * A place held for an open invitation counts as taken (X3).
 */
export async function registerForEvent(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ event, current, existing, venue, at }) => {
    const decision = canRegister(user, event, { existing, registeredCount: placesHeld(current, now), venueCapacity: venue.venueCapacity, now })
    if (!decision.allowed) refuseWith(decision)
    const record = buildRegistration(event, user, { venueNames: venue.venueNames, at })
    return { record, notices: registrationConfirmedNotifications(event, user, { venueNames: record.venueNames, at }) }
  })
}

/**
 * SPM-39 — puts `user` on event `id`'s waiting list and returns { registration } with their position. The queue order
 * is the order of these locked transactions (W3), taken from the lock's `waitlistSequence` counter. Refusals as for
 * registering, with `not_full` (a place is free: register instead) and `already_waitlisted`.
 */
export async function joinWaitingList(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ event, current, existing, venue, lock, at }) => {
    const decision = canJoinWaitingList(user, event, { existing, registeredCount: placesHeld(current, now), venueCapacity: venue.venueCapacity, now })
    if (!decision.allowed) refuseWith(decision)
    const waitlistSequence = (lock.waitlistSequence ?? 0) + 1
    return { record: buildWaitlistEntry(event, user, { venueNames: venue.venueNames, waitlistSequence, at }), lock: { waitlistSequence } }
  })
}

/**
 * SPM-59 AC1, AC2, AC5 — withdraws `user`'s registration: it becomes Withdrawn, the registered count drops by one, and
 * the freed place goes to the next person waiting by invitation (AC3), or reopens when no one is (X6). Refused unless
 * the Organiser allows it, before their cut-off and the event start (X1).
 */
export async function withdrawRegistration(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ event, existing, at }) => {
    const decision = canWithdraw(user, event, { existing, now })
    if (!decision.allowed) refuseWith(decision)
    return { record: { ...existing, status: WITHDRAWN, withdrawnAt: at, updatedAt: at } }
  })
}

/** SPM-59 X7 — `user` leaves event `id`'s waiting list; their entry becomes Withdrawn and the queue moves up. */
export async function leaveWaitingList(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ existing, at }) => {
    const decision = canLeaveWaitingList(user, existing)
    if (!decision.allowed) refuseWith(decision)
    return { record: { ...existing, status: WITHDRAWN, withdrawnAt: at, updatedAt: at } }
  })
}

/** SPM-59 X4 — the invited Attendee takes the place held for them, before the invitation expires. */
export async function acceptInvitation(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ event, existing, venue, at }) => {
    const decision = canRespondToInvitation(user, existing, now)
    if (!decision.allowed) refuseWith(decision)
    const record = { ...existing, status: REGISTERED, registeredAt: at, updatedAt: at }
    return { record, notices: registrationConfirmedNotifications(event, user, { venueNames: venue.venueNames, at }) }
  })
}

/** SPM-59 X4 — the invited Attendee turns the place down; it passes to the next person waiting. */
export async function declineInvitation(id, user, db = getAdminDb(), now = new Date()) {
  return registrationTransaction(id, user, db, now, ({ existing, at }) => {
    const decision = canRespondToInvitation(user, existing, now)
    if (!decision.allowed) refuseWith(decision)
    return { record: { ...existing, status: DECLINED, declinedAt: at, updatedAt: at } }
  })
}

/**
 * The signed-in Attendee's registrations, soonest event first. The uid comes from the verified token. SPM-41: each
 * is shown with its event as it now is — rescheduled, back in Planning or cancelled — even when the Attendee can no
 * longer open the event itself; presentOwnRegistration() sends only the event's title, time and status. SPM-59: the
 * waiting list of each event the Attendee is waiting or invited for is settled first, so a lapsed invitation shows.
 */
export async function listMyRegistrations(user, db = getAdminDb(), now = new Date()) {
  const query = db.collection(REGISTRATIONS_COLLECTION).where('attendeeUid', '==', user.uid)
  const pending = rows(await query.get()).filter((record) => [WAITLISTED, INVITED].includes(record.status))
  await Promise.all(pending.map((record) => settleEventRegistrations(db, record.eventRequestId, now)))
  const registrations = rows(await query.get())
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
 * the SPM-42/65 refusal; in scope but not one of those two (a colleague, staff, an Attendee): 403. SPM-39 and SPM-59:
 * with how many are waiting and how many places are held for open invitations.
 */
export async function listEventRegistrations(id, user, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const event = { id, ...snapshot.data() }
  requireRequestScope(user, event)
  if (!canViewRegistrations(user, event)) throw new EventRequestForbiddenError()

  await settleEventRegistrations(db, id, now)
  const [entries, venues] = await Promise.all([loadEventEntries(db, id), loadApprovedVenues(db, id, now)])
  const active = entries.filter(isActiveRegistration)
  return {
    registeredCount: active.length,
    capacity: effectiveCapacity(event.registration ?? {}, registrationVenueContext(event, venues).venueCapacity),
    // SPM-39: how many are waiting for a place. SPM-59: how many places are held for open invitations.
    waitingListCount: waitingListCount(entries),
    invitedCount: entries.filter((entry) => isOpenInvitation(entry, now)).length,
    registrations: active.sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt))).map(presentRegistrant),
  }
}
