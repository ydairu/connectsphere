import { COORDINATOR, VENUE_STAFF, isAssignedCoordinator, projectRequest, rolesOf } from '../../../shared/permissions.js'
import { BOOKING_PENDING, BOOKING_REJECTED, BOOKING_REPLACED, BOOKING_CANCELLED, canReadVenueBooking, canRequestVenue, capacityWarning, chooseVenueStaff, normaliseVenueBooking } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES, tentativeHoldExpiresAt } from '../../../shared/venueAvailability.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { pendingVenueBookings } from '../../../shared/venueBooking.js'
import { checkVenueHoldInTransaction, venueBookingLockPath, VenueValidationError } from './venueService.js'

export const BOOKINGS = 'venueBookingRequests'
export class VenueBookingError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const rows = (snapshot) => snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
const lockFor = (db, venueId) => { const [collection, id] = venueBookingLockPath(venueId); return db.collection(collection).doc(id) }

function requireCoordinator(user, event) {
  if (!rolesOf(user).includes(COORDINATOR)) throw new VenueBookingError(403, 'Only the assigned Coordinator can request a venue.')
  if (!isAssignedCoordinator(user, event)) throw new VenueBookingError(404, 'Event not found.')
}

// The event write serialises submission against cancellation/rejection/reassignment. The allocation
// lock serialises load counting and round robin. Venue locks serialise acquisition/replacement.
export async function submitVenueBooking(eventId, input, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const eventSnapshot = await tx.get(eventRef)
    if (!eventSnapshot.exists) throw new VenueBookingError(404, 'Event not found.')
    const event = eventSnapshot.data()
    requireCoordinator(user, event)
    const { value, errors } = normaliseVenueBooking(input)
    if (Object.keys(errors).length) throw new VenueValidationError(errors)
    const eventBookings = rows(await tx.get(db.collection(BOOKINGS).where('eventRequestId', '==', eventId)))
    const previousAttempt = eventBookings.find((b) => b.submissionKey === value.submissionKey)
    if (previousAttempt) {
      if (Object.keys(value).some((key) => previousAttempt[key] !== value[key])) throw new VenueBookingError(409, 'This submission reference was already used. Reload before submitting again.')
      return presentBooking(previousAttempt)
    }
    if (!canRequestVenue(user, event)) throw new VenueBookingError(409, 'Venue requests can only be submitted while the event is in Planning.')
    const old = value.replacesId ? eventBookings.find((b) => b.id === value.replacesId) : null
    if (value.replacesId && !old) throw new VenueBookingError(404, 'Booking request not found.')
    if (old && ![BOOKING_PENDING, BOOKING_REJECTED].includes(old.status)) throw new VenueBookingError(409, 'This request has already been replaced or closed. Reload the page.')
    if (old && eventBookings.some((b) => b.replacesId === old.id)) throw new VenueBookingError(409, 'This request has already been replaced. Reload the page.')

    const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
    const allocation = await tx.get(allocationRef)
    const users = rows(await tx.get(db.collection('users'))).map((u) => ({ ...u, uid: u.id }))
    const pending = rows(await tx.get(db.collection(BOOKINGS).where('status', '==', BOOKING_PENDING)))
    const assignee = old ? users.find((u) => u.uid === old.assignedVenueStaffUid && rolesOf(u).includes(VENUE_STAFF)) : chooseVenueStaff(users, pending, allocation.data()?.lastUid)
    if (!assignee) throw new VenueBookingError(409, old ? 'The assigned Venue Staff account is unavailable. Restore its access before revising this request.' : 'No Venue Staff account is available. A request and hold have not been created.')

    let oldHold = null
    let oldLock = null
    if (old) {
      oldHold = await tx.get(db.collection('venueAvailability').doc(old.holdId))
      if (!oldHold.exists || oldHold.data().eventRequestId !== eventId || oldHold.data().venueId !== old.venueId || oldHold.data().status !== AVAILABILITY_STATUS.TENTATIVE_HOLD) {
        throw new VenueBookingError(409, 'The original hold cannot be replaced. Reload or contact support.')
      }
      oldLock = lockFor(db, old.venueId)
      await tx.get(oldLock)
    }
    const { venue, lockRef } = await checkVenueHoldInTransaction(tx, db, value, now, old?.holdId)
    const ref = db.collection(BOOKINGS).doc()
    const holdRef = db.collection('venueAvailability').doc()
    const at = now.toISOString()
    const booking = { ...value, eventRequestId: eventId, eventTitle: event.core?.title ?? '',
      expectedAttendees: event.core?.expectedAttendees ?? null, venueName: venue.name,
      capacityWarning: capacityWarning(event.core?.expectedAttendees, venue.maximumCapacity),
      status: BOOKING_PENDING, assignedVenueStaffUid: assignee.uid, assignedVenueStaffName: assignee.name ?? 'Venue Staff',
      holdId: holdRef.id, holdExpiresAt: tentativeHoldExpiresAt(now), createdByUid: user.uid, createdAt: at }
    if (old) {
      tx.update(db.collection(BOOKINGS).doc(old.id), { status: old.status === BOOKING_REJECTED ? BOOKING_REJECTED : BOOKING_REPLACED, replacedById: ref.id, updatedAt: at })
      tx.update(oldHold.ref, { lifecycleStatus: 'removed', removedAt: at, removedByUid: user.uid })
      tx.set(oldLock, { venueId: old.venueId, updatedAt: at })
    }
    tx.set(ref, booking)
    tx.set(holdRef, { venueId: value.venueId, eventRequestId: eventId, bookingRequestId: ref.id,
      startsAt: value.startsAt, endsAt: value.endsAt, title: event.core?.title ?? '',
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD, lifecycleStatus: 'active', holdExpiresAt: booking.holdExpiresAt,
      createdAt: at, createdByUid: user.uid })
    tx.set(lockRef, { venueId: value.venueId, lastCommitmentId: holdRef.id, updatedAt: at })
    tx.set(allocationRef, { lastUid: old ? allocation.data()?.lastUid ?? assignee.uid : assignee.uid, updatedAt: at })
    tx.update(eventRef, { assignedStaffUids: [...new Set([...(event.assignedStaffUids ?? []), assignee.uid])], updatedAt: at })
    tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_requested', bookingRequestId: ref.id,
      replacesId: old?.id ?? null, actor: { uid: user.uid, role: COORDINATOR }, assignedVenueStaffUid: assignee.uid, at })
    return presentBooking({ id: ref.id, ...booking })
  })
}

function presentBooking(booking) {
  const keys = ['id', 'eventRequestId', 'eventTitle', 'expectedAttendees', 'venueId', 'venueName', 'startsAt', 'endsAt', 'requirements', 'specialRequests', 'status', 'assignedVenueStaffName', 'holdExpiresAt', 'capacityWarning', 'createdAt', 'replacesId', 'replacedById']
  return Object.fromEntries(keys.filter((key) => booking[key] !== undefined).map((key) => [key, booking[key]]))
}

export async function listEventVenueBookings(eventId, user, db = getAdminDb()) {
  const snapshot = await db.collection('eventRequests').doc(eventId).get()
  if (!snapshot.exists) throw new VenueBookingError(404, 'Event not found.')
  const event = { ...snapshot.data(), id: eventId }
  const bookings = rows(await db.collection(BOOKINGS).where('eventRequestId', '==', eventId).get())
  const coordinator = rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)
  const visible = bookings.filter((b) => canReadVenueBooking(user, event, b))
  if (!coordinator && !visible.length) throw new VenueBookingError(404, 'Event not found.')
  return { event: projectRequest(user, event), canSubmit: canRequestVenue(user, event),
    bookings: visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(presentBooking) }
}

export async function listVenueBookingQueue(user, db = getAdminDb()) {
  if (!rolesOf(user).includes(VENUE_STAFF)) throw new VenueBookingError(403, 'Only Venue Staff can view this queue.')
  const bookings = rows(await db.collection(BOOKINGS).where('assignedVenueStaffUid', '==', user.uid).get())
  return { bookings: pendingVenueBookings(bookings).map(presentBooking) }
}

// Read everything first; caller may then write its status/history and invoke the returned write phase.
export async function prepareVenueHoldRelease(tx, db, eventId, user, now) {
  const holds = (await tx.get(db.collection('venueAvailability').where('eventRequestId', '==', eventId))).docs
    .filter((doc) => doc.data().status === AVAILABILITY_STATUS.TENTATIVE_HOLD && !REMOVED_STATUSES.has(doc.data().lifecycleStatus))
  const bookings = (await tx.get(db.collection(BOOKINGS).where('eventRequestId', '==', eventId))).docs.filter((doc) => doc.data().status === BOOKING_PENDING)
  const locks = [...new Set(holds.map((doc) => doc.data().venueId))].sort().map((id) => lockFor(db, id))
  for (const ref of locks) await tx.get(ref)
  const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
  const allocation = bookings.length ? await tx.get(allocationRef) : null
  return () => {
    const at = now.toISOString()
    for (const hold of holds) tx.update(hold.ref, { lifecycleStatus: 'removed', removedAt: at, removedByUid: user.uid })
    for (const booking of bookings) tx.update(booking.ref, { status: BOOKING_CANCELLED, updatedAt: at })
    for (const ref of locks) tx.set(ref, { updatedAt: at })
    if (allocation) tx.set(allocationRef, { ...allocation.data(), updatedAt: at })
  }
}
