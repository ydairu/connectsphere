import { COORDINATOR, VENUE_STAFF, isAssignedCoordinator, projectRequest, rolesOf } from '../../../shared/permissions.js'
import { BOOKING_PENDING, BOOKING_APPROVED, BOOKING_REJECTED, BOOKING_REPLACED, BOOKING_CANCELLED, BOOKING_EXPIRED, effectiveVenueBookingStatus, canReadVenueBooking, canRejectVenueBooking, canApproveVenueBooking, canRequestVenue, chooseVenueStaff, normaliseVenueBooking, normaliseVenueBookingRejection, venueBookingApprovalErrors, venueBookingSuitability, venueBookingReadiness, venueNeedId } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES, tentativeHoldExpiresAt, validateAvailabilityRange } from '../../../shared/venueAvailability.js'
import { venueBookingApprovedNotifications, venueBookingRejectedNotifications } from '../../../shared/notifications.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { pendingVenueBookings } from '../../../shared/venueBooking.js'
import { eventPeriod } from '../../../shared/venueSuitability.js'
import { checkVenueHoldInTransaction, venueBookingLockPath, VenueValidationError } from './venueService.js'
import { addNotifications } from './notificationService.js'

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
    const period = eventPeriod(event)
    if (!period) throw new VenueBookingError(409, 'Set a valid event date and duration before requesting a venue.')
    const periodErrors = {}
    if (value.startsAt < period.startsAt || value.startsAt >= period.endsAt) periodErrors.startsAt = 'Start within the event schedule.'
    if (value.endsAt > period.endsAt || value.endsAt <= period.startsAt) periodErrors.endsAt = 'End within the event schedule.'
    if (!Number.isInteger(event.core?.expectedAttendees) || value.attendeeCount > event.core.expectedAttendees) periodErrors.attendeeCount = 'Attendee count cannot exceed event attendance.'
    if (Object.keys(periodErrors).length) throw new VenueValidationError(periodErrors)
    const old = value.replacesId ? eventBookings.find((b) => b.id === value.replacesId) : null
    if (value.replacesId && !old) throw new VenueBookingError(404, 'Booking request not found.')
    if (old && ![BOOKING_PENDING, BOOKING_REJECTED, BOOKING_EXPIRED].includes(effectiveVenueBookingStatus(old, now))) throw new VenueBookingError(409, 'This request has already been replaced or closed. Reload the page.')
    if (old && eventBookings.some((b) => b.replacesId === old.id)) throw new VenueBookingError(409, 'This request has already been replaced. Reload the page.')

    const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
    const allocation = await tx.get(allocationRef)
    const users = rows(await tx.get(db.collection('users'))).map((u) => ({ ...u, uid: u.id }))
    const pending = rows(await tx.get(db.collection(BOOKINGS).where('status', '==', BOOKING_PENDING)))
    const assignee = old ? users.find((u) => u.uid === old.assignedVenueStaffUid && rolesOf(u).includes(VENUE_STAFF)) : chooseVenueStaff(users, pending, allocation.data()?.lastUid, now)
    if (!assignee) throw new VenueBookingError(409, old ? 'The assigned Venue Staff account is unavailable. Restore its access before revising this request.' : 'No Venue Staff account is available. A request and hold have not been created.')

    let oldHold = null
    let oldLock = null
    if (old) {
      oldHold = await tx.get(db.collection('venueAvailability').doc(old.holdId))
      if (!oldHold.exists || oldHold.data().eventRequestId !== eventId || oldHold.data().venueId !== old.venueId || oldHold.data().bookingRequestId !== old.id || oldHold.data().status !== AVAILABILITY_STATUS.TENTATIVE_HOLD ||
        ([BOOKING_REJECTED, BOOKING_EXPIRED].includes(effectiveVenueBookingStatus(old, now)) && old.status !== BOOKING_PENDING && !REMOVED_STATUSES.has(oldHold.data().lifecycleStatus))) {
        throw new VenueBookingError(409, 'The original hold cannot be replaced. Reload or contact support.')
      }
      oldLock = lockFor(db, old.venueId)
      await tx.get(oldLock)
    }
    const { venue, lockRef } = await checkVenueHoldInTransaction(tx, db, value, now, old?.status === BOOKING_PENDING ? old.holdId : undefined)
    if (!Number.isFinite(Number(venue.maximumCapacity)) || value.attendeeCount > Number(venue.maximumCapacity)) {
      throw new VenueValidationError({ attendeeCount: 'Attendee count exceeds venue capacity.' })
    }
    const ref = db.collection(BOOKINGS).doc()
    const needId = old ? venueNeedId(old, eventBookings) : ref.id
    if (!needId) throw new VenueBookingError(409, 'The original booking chain is incomplete. Reload or contact support.')
    const holdRef = db.collection('venueAvailability').doc()
    const at = now.toISOString()
    const booking = { ...value, venueNeedId: needId, eventRequestId: eventId, eventTitle: event.core?.title ?? '',
      expectedAttendees: event.core?.expectedAttendees ?? null, venueName: venue.name,
      capacityWarning: null,
      status: BOOKING_PENDING, assignedVenueStaffUid: assignee.uid, assignedVenueStaffName: assignee.name ?? 'Venue Staff',
      holdId: holdRef.id, holdExpiresAt: tentativeHoldExpiresAt(now), createdByUid: user.uid, createdAt: at }
    if (old) {
      tx.update(db.collection(BOOKINGS).doc(old.id), { status: effectiveVenueBookingStatus(old, now) === BOOKING_EXPIRED ? BOOKING_EXPIRED : old.status === BOOKING_REJECTED ? BOOKING_REJECTED : BOOKING_REPLACED, replacedById: ref.id, updatedAt: at })
      if (!REMOVED_STATUSES.has(oldHold.data().lifecycleStatus)) tx.update(oldHold.ref, { lifecycleStatus: 'removed', removedAt: at, removedByUid: user.uid })
      tx.set(oldLock, { venueId: old.venueId, updatedAt: at })
    }
    tx.set(ref, booking)
    tx.set(holdRef, { venueId: value.venueId, eventRequestId: eventId, bookingRequestId: ref.id,
      startsAt: value.startsAt, endsAt: value.endsAt, attendeeCount: value.attendeeCount, title: event.core?.title ?? '',
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

export async function rejectVenueBooking(eventId, bookingId, input, user, db = getAdminDb(), now = new Date()) {
  if (!rolesOf(user).includes(VENUE_STAFF)) throw new VenueBookingError(403, 'Only Venue Staff can reject a venue booking.')
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const bookingRef = db.collection(BOOKINGS).doc(bookingId)
    const eventSnapshot = await tx.get(eventRef)
    const bookingSnapshot = await tx.get(bookingRef)
    if (!eventSnapshot.exists || !bookingSnapshot.exists || bookingSnapshot.data().eventRequestId !== eventId ||
      bookingSnapshot.data().assignedVenueStaffUid !== user.uid) throw new VenueBookingError(404, 'Booking request not found.')
    const event = { ...eventSnapshot.data(), id: eventId }
    const booking = { ...bookingSnapshot.data(), id: bookingId }
    if (!canRejectVenueBooking(user, event, booking, now)) throw new VenueBookingError(409, 'Only a pending booking in Planning with an unexpired hold can be rejected.')
    const { value, errors } = normaliseVenueBookingRejection(input)
    if (Object.keys(errors).length) throw new VenueValidationError(errors)
    const holdRef = db.collection('venueAvailability').doc(booking.holdId)
    const holdSnapshot = await tx.get(holdRef)
    if (!holdSnapshot.exists || holdSnapshot.data().bookingRequestId !== bookingId || holdSnapshot.data().eventRequestId !== eventId ||
      holdSnapshot.data().venueId !== booking.venueId || holdSnapshot.data().status !== AVAILABILITY_STATUS.TENTATIVE_HOLD) {
      throw new VenueBookingError(409, 'The booking hold has changed. Reload before rejecting.')
    }
    const venueLock = lockFor(db, booking.venueId)
    const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
    await tx.get(venueLock)
    const allocation = await tx.get(allocationRef)
    const at = now.toISOString()
    const rejection = { status: BOOKING_REJECTED, rejectionReason: value.reason,
      suggestedAlternative: value.suggestedAlternative, rejectedByUid: user.uid, rejectedAt: at, updatedAt: at }
    tx.update(bookingRef, rejection)
    if (!REMOVED_STATUSES.has(holdSnapshot.data().lifecycleStatus)) {
      tx.update(holdRef, { lifecycleStatus: 'removed', removedAt: at, removedByUid: user.uid })
    }
    tx.set(venueLock, { venueId: booking.venueId, updatedAt: at })
    tx.set(allocationRef, { ...allocation.data(), updatedAt: at })
    const eventUpdate = { updatedAt: at }
    if (event.arrangementApprovals?.venue) {
      eventUpdate.arrangementApprovals = Object.fromEntries(Object.entries(event.arrangementApprovals).filter(([key]) => key !== 'venue'))
    }
    tx.update(eventRef, eventUpdate)
    tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_rejected', bookingRequestId: bookingId,
      reason: value.reason, suggestedAlternative: value.suggestedAlternative, actor: { uid: user.uid, role: VENUE_STAFF }, at })
    addNotifications(tx, db, venueBookingRejectedNotifications(event, booking, user, { reason: value.reason, at }))
    return presentBooking({ ...booking, ...rejection })
  })
}

export async function approveVenueBooking(eventId, bookingId, input, user, db = getAdminDb(), now = null) {
  if (!rolesOf(user).includes(VENUE_STAFF)) throw new VenueBookingError(403, 'Only Venue Staff can approve a venue booking.')
  return db.runTransaction(async (tx) => {
    // Capture time for each transaction attempt, including Firestore retries near the deadline.
    const decisionNow = now ?? new Date()
    const eventRef = db.collection('eventRequests').doc(eventId)
    const bookingRef = db.collection(BOOKINGS).doc(bookingId)
    const eventSnapshot = await tx.get(eventRef)
    const bookingSnapshot = await tx.get(bookingRef)
    if (!eventSnapshot.exists || !bookingSnapshot.exists || bookingSnapshot.data().eventRequestId !== eventId ||
      bookingSnapshot.data().assignedVenueStaffUid !== user.uid) throw new VenueBookingError(404, 'Booking request not found.')
    const event = { ...eventSnapshot.data(), id: eventId }
    const booking = { ...bookingSnapshot.data(), id: bookingId }
    if (!canApproveVenueBooking(user, event, booking, decisionNow)) throw new VenueBookingError(409, 'Only a pending booking in Planning with an unexpired hold can be approved. Reload the booking.')
    const errors = venueBookingApprovalErrors(input)
    if (Object.keys(errors).length) throw new VenueValidationError(errors)
    const range = validateAvailabilityRange({ from: booking.startsAt, to: booking.endsAt })
    const eventWindow = eventPeriod(event)
    const attendeeCount = booking.attendeeCount ?? event.core?.expectedAttendees
    if (Object.keys(range.errors).length || !eventWindow || booking.startsAt < eventWindow.startsAt || booking.endsAt > eventWindow.endsAt ||
      !Number.isInteger(attendeeCount) || attendeeCount <= 0 || attendeeCount > event.core?.expectedAttendees) {
      throw new VenueBookingError(409, 'The booking needs valid dates and current event attendance before approval.')
    }
    if (typeof booking.holdId !== 'string' || !booking.holdId) throw new VenueBookingError(409, 'The booking hold is missing. Ask the Coordinator to replace the request.')
    const holdRef = db.collection('venueAvailability').doc(booking.holdId)
    const holdSnapshot = await tx.get(holdRef)
    const hold = holdSnapshot.data()
    if (!hold || hold.bookingRequestId !== bookingId || hold.eventRequestId !== eventId || hold.venueId !== booking.venueId ||
      hold.status !== AVAILABILITY_STATUS.TENTATIVE_HOLD || REMOVED_STATUSES.has(hold.lifecycleStatus) ||
      hold.startsAt !== booking.startsAt || hold.endsAt !== booking.endsAt ||
      (hold.attendeeCount != null && hold.attendeeCount !== attendeeCount) ||
      hold.holdExpiresAt !== booking.holdExpiresAt || !Number.isFinite(Date.parse(hold.holdExpiresAt)) ||
      Date.parse(hold.holdExpiresAt) <= decisionNow.getTime()) {
      throw new VenueBookingError(409, 'The booking hold has changed or was released. Ask the Coordinator to replace the request.')
    }
    const { venue, lockRef } = await checkVenueHoldInTransaction(tx, db, booking, decisionNow, booking.holdId)
    const suitability = venueBookingSuitability(event, booking, venue)
    if (suitability.problems.length) throw new VenueBookingError(409, suitability.problems.map((problem) => problem.message).join(' '))
    // A decision changes pending workload; serialize it with SPM-14 staff allocation too.
    const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
    const allocation = await tx.get(allocationRef)
    if (!now && Date.now() >= Date.parse(hold.holdExpiresAt)) throw new VenueBookingError(409, 'The booking hold expired during approval. Ask the Coordinator to replace the request.')
    const at = (now ?? new Date()).toISOString()
    const approval = { status: BOOKING_APPROVED, approvedByUid: user.uid, approvedAt: at, updatedAt: at,
      holdExpiresAt: null, capacityWarning: null, approvalWarnings: suitability.warnings }
    tx.update(bookingRef, approval)
    tx.update(holdRef, { status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, holdExpiresAt: null,
      confirmedAt: at, confirmedByUid: user.uid })
    tx.set(lockRef, { venueId: booking.venueId, lastCommitmentId: booking.holdId, updatedAt: at })
    tx.set(allocationRef, { ...allocation.data(), updatedAt: at })
    // This also serializes against cancellation, significant edits and Coordinator reassignment.
    tx.update(eventRef, { updatedAt: at })
    tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_approved', bookingRequestId: bookingId,
      actor: { uid: user.uid, role: VENUE_STAFF }, at })
    addNotifications(tx, db, venueBookingApprovedNotifications(event, booking, user, { at }))
    return presentBooking({ ...booking, ...approval })
  })
}

function presentBooking(booking, canReject = false, canApprove = false, now = new Date()) {
  const keys = ['id', 'eventRequestId', 'eventTitle', 'expectedAttendees', 'attendeeCount', 'venueNeedId', 'venueId', 'venueName', 'startsAt', 'endsAt', 'requirements', 'specialRequests', 'status', 'assignedVenueStaffName', 'holdExpiresAt', 'capacityWarning', 'createdAt', 'replacesId', 'replacedById', 'rejectionReason', 'suggestedAlternative', 'rejectedAt', 'approvedAt', 'approvalWarnings']
  return { ...Object.fromEntries(keys.filter((key) => booking[key] !== undefined).map((key) => [key, booking[key]])), status: effectiveVenueBookingStatus(booking, now), canReject, canApprove }
}

export async function loadVenueBookingReadiness(eventId, db = getAdminDb(), now = new Date(), tx = null) {
  const query = db.collection(BOOKINGS).where('eventRequestId', '==', eventId)
  const snapshot = tx ? await tx.get(query) : await query.get()
  return venueBookingReadiness(rows(snapshot), now)
}

export async function listEventVenueBookings(eventId, user, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('eventRequests').doc(eventId).get()
  if (!snapshot.exists) throw new VenueBookingError(404, 'Event not found.')
  const event = { ...snapshot.data(), id: eventId }
  const bookings = rows(await db.collection(BOOKINGS).where('eventRequestId', '==', eventId).get())
  const coordinator = rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)
  const visible = bookings.filter((b) => canReadVenueBooking(user, event, b))
  if (!coordinator && !visible.length) throw new VenueBookingError(404, 'Event not found.')
  return { event: projectRequest(user, event), canSubmit: canRequestVenue(user, event),
    bookings: await Promise.all(visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(async (b) => {
      const presented = presentBooking(b, canRejectVenueBooking(user, event, b, now), canApproveVenueBooking(user, event, b, now), now)
      if (presented.status === BOOKING_PENDING) {
        const venue = await db.collection('venues').doc(b.venueId).get()
        const { problems, warnings } = venue.exists ? venueBookingSuitability(event, b, venue.data())
          : { problems: [{ check: 'venue', message: 'This venue is unavailable. Ask the Coordinator to replace the request.' }], warnings: [] }
        presented.suitability = { problems, warnings }
      }
      return presented
    })) }
}

export async function listVenueBookingQueue(user, db = getAdminDb(), now = new Date()) {
  if (!rolesOf(user).includes(VENUE_STAFF)) throw new VenueBookingError(403, 'Only Venue Staff can view this queue.')
  const bookings = rows(await db.collection(BOOKINGS).where('assignedVenueStaffUid', '==', user.uid).get())
  return { bookings: pendingVenueBookings(bookings, now).map((booking) => presentBooking(booking, false, false, now)) }
}

// Whole-event closure releases tentative AND confirmed reservations (SPM-54).
// Read everything first; caller may then write its status/history and invoke the returned write phase.
export async function prepareVenueHoldRelease(tx, db, eventId, user, now) {
  const holds = (await tx.get(db.collection('venueAvailability').where('eventRequestId', '==', eventId))).docs
    .filter((doc) => [AVAILABILITY_STATUS.TENTATIVE_HOLD, AVAILABILITY_STATUS.CONFIRMED_BOOKING].includes(doc.data().status) && !REMOVED_STATUSES.has(doc.data().lifecycleStatus))
  const bookings = (await tx.get(db.collection(BOOKINGS).where('eventRequestId', '==', eventId))).docs.filter((doc) => [BOOKING_PENDING, BOOKING_APPROVED].includes(doc.data().status))
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
