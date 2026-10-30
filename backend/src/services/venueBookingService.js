import { COORDINATOR, ORGANISER, VENUE_STAFF, inScopeAs, isAssignedCoordinator, projectRequest, rolesOf } from '../../../shared/permissions.js'
import { awaitingReapproval, BOOKING_PENDING, BOOKING_APPROVED, BOOKING_REJECTED, BOOKING_REPLACED, BOOKING_CANCELLED, BOOKING_EXPIRED, VENUE_BOOKING_CANCELLED, effectiveVenueBookingStatus, canReadVenueBooking, canRejectVenueBooking, canApproveVenueBooking, canCancelVenueBooking, canRequestVenue, chooseVenueStaff, normaliseVenueBooking, normaliseVenueBookingRejection, venueBookingApprovalErrors, venueBookingCancellationErrors, venueBookingSuitability, venueBookingReadiness, venueNeedId } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES, tentativeHoldExpiresAt, validateAvailabilityRange } from '../../../shared/venueAvailability.js'
import { venueBookingApprovedNotifications, venueBookingRejectedNotifications } from '../../../shared/notifications.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { pendingVenueBookings } from '../../../shared/venueBooking.js'
import { eventPeriod } from '../../../shared/venueSuitability.js'
import { checkVenueHoldInTransaction, venueBookingLockPath, VenueValidationError } from './venueService.js'
import { addNotifications } from './notificationService.js'
import { recordStatusChange, userActor } from './statusHistory.js'
import { CONFIRMED, PLANNING, PREPARATION } from '../../../shared/status.js'
import { recordPrimaryVenueChange } from './primaryVenueHistory.js'
import { INVALIDATED_BY_VENUE_BOOKING_CANCELLED, INVALIDATED_BY_VENUE_BOOKING_REQUESTED, safetyReviewInvalidation } from '../../../shared/safetyReviewState.js'

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
      return presentBooking(previousAttempt, false, false, now)
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
    if (old && ![BOOKING_PENDING, BOOKING_REJECTED, BOOKING_EXPIRED, BOOKING_CANCELLED].includes(effectiveVenueBookingStatus(old, now))) throw new VenueBookingError(409, 'This request has already been replaced or closed. Reload the page.')
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
      const cancelled = old.status === BOOKING_CANCELLED
      if (!oldHold.exists || oldHold.data().eventRequestId !== eventId || oldHold.data().venueId !== old.venueId || oldHold.data().bookingRequestId !== old.id ||
        oldHold.data().status !== (cancelled ? AVAILABILITY_STATUS.CONFIRMED_BOOKING : AVAILABILITY_STATUS.TENTATIVE_HOLD) ||
        (cancelled && !REMOVED_STATUSES.has(oldHold.data().lifecycleStatus)) ||
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
      tx.update(db.collection(BOOKINGS).doc(old.id), { status: effectiveVenueBookingStatus(old, now) === BOOKING_EXPIRED ? BOOKING_EXPIRED :
        [BOOKING_REJECTED, BOOKING_CANCELLED].includes(old.status) ? old.status : BOOKING_REPLACED,
      replacedById: ref.id, updatedAt: at })
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
    // SPM-91: a new or replacement venue has not been safety-reviewed, so the current review is withdrawn.
    const safetyReview = safetyReviewInvalidation(event, INVALIDATED_BY_VENUE_BOOKING_REQUESTED, at)
    tx.update(eventRef, { assignedStaffUids: [...new Set([...(event.assignedStaffUids ?? []), assignee.uid])], ...(safetyReview ? { safetyReview } : {}), updatedAt: at })
    tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_requested', bookingRequestId: ref.id,
      replacesId: old?.id ?? null, actor: { uid: user.uid, role: COORDINATOR }, assignedVenueStaffUid: assignee.uid, at })
    return presentBooking({ id: ref.id, ...booking }, false, false, now)
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
    if (!canRejectVenueBooking(user, event, booking, now)) throw new VenueBookingError(409, 'Only a pending booking in Planning with an unexpired hold, or one sent back for re-approval, can be rejected.')
    const { value, errors } = normaliseVenueBookingRejection(input)
    if (Object.keys(errors).length) throw new VenueValidationError(errors)
    // SPM-87: a booking sent back for re-approval holds a confirmed reservation, not a tentative hold.
    const reapproval = awaitingReapproval(booking)
    const holdRef = db.collection('venueAvailability').doc(booking.holdId)
    const holdSnapshot = await tx.get(holdRef)
    if (!holdSnapshot.exists || holdSnapshot.data().bookingRequestId !== bookingId || holdSnapshot.data().eventRequestId !== eventId ||
      holdSnapshot.data().venueId !== booking.venueId ||
      holdSnapshot.data().status !== (reapproval ? AVAILABILITY_STATUS.CONFIRMED_BOOKING : AVAILABILITY_STATUS.TENTATIVE_HOLD)) {
      throw new VenueBookingError(409, 'The booking hold has changed. Reload before rejecting.')
    }
    const venueLock = lockFor(db, booking.venueId)
    const allocationRef = db.collection('systemLocks').doc('venueStaffAssignment')
    await tx.get(venueLock)
    const allocation = await tx.get(allocationRef)
    const at = now.toISOString()
    const rejection = { status: BOOKING_REJECTED, rejectionReason: value.reason,
      suggestedAlternative: value.suggestedAlternative, rejectedByUid: user.uid, rejectedAt: at, updatedAt: at,
      ...(reapproval ? { reapprovalRequestedAt: null, reapprovalRequestedByUid: null } : {}) }
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
    // SPM-87 with SPM-90: a rejected re-approval removes the venue, so it can no longer be the primary venue.
    if (reapproval && event.primaryVenue?.bookingId === bookingId) {
      eventUpdate.primaryVenue = null
      eventUpdate.primaryVenueSelectionRequired = true
      recordPrimaryVenueChange(tx, eventRef, event.primaryVenue, null,
        { type: 'user', uid: user.uid, name: user.name ?? null, role: VENUE_STAFF }, at)
    }
    tx.update(eventRef, eventUpdate)
    tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_rejected', bookingRequestId: bookingId, reapproval,
      reason: value.reason, suggestedAlternative: value.suggestedAlternative, actor: { uid: user.uid, role: VENUE_STAFF }, at })
    addNotifications(tx, db, venueBookingRejectedNotifications(event, booking, user, { reason: value.reason, at }))
    return presentBooking({ ...booking, ...rejection }, false, false, now)
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
    if (!canApproveVenueBooking(user, event, booking, decisionNow)) throw new VenueBookingError(409, 'Only a pending booking in Planning with an unexpired hold, or one sent back for re-approval, can be approved. Reload the booking.')
    const errors = venueBookingApprovalErrors(input)
    if (Object.keys(errors).length) throw new VenueValidationError(errors)
    if (awaitingReapproval(booking)) return reapproveInTransaction(tx, { db, eventRef, bookingRef, event, booking, user, now, decisionNow })
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
    return presentBooking({ ...booking, ...approval }, false, false, decisionNow)
  })
}

// SPM-87: approving again a booking the Coordinator sent back for re-approval. Its reservation is already
// confirmed, so only the event window, the attendance and the venue's suitability are checked again; the
// reservation itself must still be the confirmed one.
async function reapproveInTransaction(tx, { db, eventRef, bookingRef, event, booking, user, now, decisionNow }) {
  const eventWindow = eventPeriod(event)
  const attendeeCount = booking.attendeeCount ?? event.core?.expectedAttendees
  if (!eventWindow || booking.startsAt < eventWindow.startsAt || booking.endsAt > eventWindow.endsAt ||
    !Number.isInteger(attendeeCount) || attendeeCount <= 0 || attendeeCount > event.core?.expectedAttendees) {
    throw new VenueBookingError(409, 'The booked period or attendance no longer fits the event. Reject it so the Coordinator can request a replacement.')
  }
  const holdRef = db.collection('venueAvailability').doc(booking.holdId)
  const hold = (await tx.get(holdRef)).data()
  if (!hold || hold.bookingRequestId !== booking.id || hold.eventRequestId !== event.id || hold.venueId !== booking.venueId ||
    hold.status !== AVAILABILITY_STATUS.CONFIRMED_BOOKING || REMOVED_STATUSES.has(hold.lifecycleStatus) ||
    hold.startsAt !== booking.startsAt || hold.endsAt !== booking.endsAt) {
    throw new VenueBookingError(409, 'The confirmed reservation has changed. Reload the booking.')
  }
  const venueSnapshot = await tx.get(db.collection('venues').doc(booking.venueId))
  if (!venueSnapshot.exists) throw new VenueBookingError(409, 'This venue is no longer in the catalogue. Reject the booking so the Coordinator can replace it.')
  const suitability = venueBookingSuitability(event, booking, venueSnapshot.data())
  if (suitability.problems.length) throw new VenueBookingError(409, suitability.problems.map((problem) => problem.message).join(' '))
  const at = (now ?? new Date()).toISOString()
  const approval = { reapprovalRequestedAt: null, reapprovalRequestedByUid: null, reapprovedByUid: user.uid, reapprovedAt: at,
    approvalWarnings: suitability.warnings, updatedAt: at }
  tx.update(bookingRef, approval)
  tx.update(eventRef, { updatedAt: at })
  tx.set(eventRef.collection('activity').doc(), { type: 'venue_booking_reapproved', bookingRequestId: booking.id,
    actor: { uid: user.uid, role: VENUE_STAFF }, at })
  addNotifications(tx, db, venueBookingApprovedNotifications(event, booking, user, { at }))
  return presentBooking({ ...booking, ...approval }, false, false, decisionNow)
}

export async function cancelVenueBooking(eventId, bookingId, input, user, db = getAdminDb(), now = new Date()) {
  if (!rolesOf(user).includes(COORDINATOR)) throw new VenueBookingError(403, 'Only the assigned Coordinator can cancel a venue booking.')
  const errors = venueBookingCancellationErrors(input)
  if (Object.keys(errors).length) throw new VenueValidationError(errors)
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const bookingRef = db.collection(BOOKINGS).doc(bookingId)
    const eventSnapshot = await tx.get(eventRef)
    if (!eventSnapshot.exists) throw new VenueBookingError(404, 'Event not found.')
    const event = { ...eventSnapshot.data(), id: eventId }
    if (!isAssignedCoordinator(user, event)) throw new VenueBookingError(404, 'Event not found.')
    const bookingSnapshot = await tx.get(bookingRef)
    if (!bookingSnapshot.exists || bookingSnapshot.data().eventRequestId !== eventId) throw new VenueBookingError(404, 'Booking request not found.')
    const booking = { ...bookingSnapshot.data(), id: bookingId }
    if (!canCancelVenueBooking(user, event, booking, now) || booking.replacedById) {
      throw new VenueBookingError(409, 'This approved booking cannot be cancelled. Reload the booking.')
    }
    if (typeof booking.holdId !== 'string' || !booking.holdId) {
      throw new VenueBookingError(409, 'The confirmed reservation is missing. Reload the booking.')
    }
    const holdRef = db.collection('venueAvailability').doc(booking.holdId)
    const holdSnapshot = await tx.get(holdRef)
    const hold = holdSnapshot.data()
    if (!hold || hold.eventRequestId !== eventId || hold.bookingRequestId !== bookingId ||
      hold.venueId !== booking.venueId || hold.status !== AVAILABILITY_STATUS.CONFIRMED_BOOKING ||
      hold.startsAt !== booking.startsAt || hold.endsAt !== booking.endsAt ||
      REMOVED_STATUSES.has(hold.lifecycleStatus)) {
      throw new VenueBookingError(409, 'The confirmed reservation has changed. Reload the booking.')
    }
    const lockRef = lockFor(db, booking.venueId)
    await tx.get(lockRef)
    const at = now.toISOString()
    tx.update(bookingRef, { status: BOOKING_CANCELLED, cancelledAt: at, cancelledByUid: user.uid, updatedAt: at })
    tx.update(holdRef, { lifecycleStatus: 'removed', removedAt: at, removedByUid: user.uid })
    tx.set(lockRef, { venueId: booking.venueId, updatedAt: at })
    const returnsToPlanning = event.status === CONFIRMED || event.status === PREPARATION
    const eventUpdate = { ...(returnsToPlanning ? { status: PLANNING } : {}), updatedAt: at }
    if (event.primaryVenue?.bookingId === bookingId) {
      eventUpdate.primaryVenue = null
      eventUpdate.primaryVenueSelectionRequired = true
      recordPrimaryVenueChange(tx, eventRef, event.primaryVenue, null,
        { type: 'user', uid: user.uid, name: user.name ?? null, role: COORDINATOR }, at)
    }
    if (event.arrangementApprovals?.venue) {
      eventUpdate.arrangementApprovals = Object.fromEntries(Object.entries(event.arrangementApprovals).filter(([key]) => key !== 'venue'))
    }
    // SPM-91 [Team decision pending]: the venue the Safety Officer reviewed is no longer booked, so a safety
    // approval or a pending safety check is withdrawn and the replacement arrangement must be reviewed again.
    const safetyReview = safetyReviewInvalidation(event, INVALIDATED_BY_VENUE_BOOKING_CANCELLED, at)
    if (safetyReview) eventUpdate.safetyReview = safetyReview
    tx.update(eventRef, eventUpdate)
    tx.set(eventRef.collection('activity').doc(), { type: VENUE_BOOKING_CANCELLED, bookingRequestId: bookingId,
      actor: { uid: user.uid, role: COORDINATOR }, at })
    if (returnsToPlanning) recordStatusChange(tx, eventRef, { action: VENUE_BOOKING_CANCELLED,
      fromStatus: event.status, toStatus: PLANNING, actor: userActor(user), at })
    return presentBooking({ ...booking, status: BOOKING_CANCELLED, cancelledAt: at, updatedAt: at }, false, false, now)
  })
}

function presentBooking(booking, canReject = false, canApprove = false, now = new Date(), canCancel = false) {
  const keys = ['id', 'eventRequestId', 'eventTitle', 'expectedAttendees', 'attendeeCount', 'venueNeedId', 'venueId', 'venueName', 'startsAt', 'endsAt', 'requirements', 'specialRequests', 'status', 'assignedVenueStaffName', 'holdExpiresAt', 'capacityWarning', 'createdAt', 'replacesId', 'replacedById', 'rejectionReason', 'suggestedAlternative', 'rejectedAt', 'approvedAt', 'cancelledAt', 'approvalWarnings', 'reapprovedAt']
  return { ...Object.fromEntries(keys.filter((key) => booking[key] !== undefined).map((key) => [key, booking[key]])), status: effectiveVenueBookingStatus(booking, now),
    awaitingReapproval: awaitingReapproval(booking), canReject, canApprove, canCancel }
}

// The Organiser sees booking outcomes, not staff assignment, internal requirements or approval notes.
function presentOrganiserBooking(booking, now) {
  const fields = ['id', 'venueNeedId', 'replacesId', 'venueName', 'startsAt', 'endsAt', 'createdAt', 'approvedAt', 'cancelledAt']
  return { ...Object.fromEntries(fields.filter((key) => booking[key] !== undefined).map((key) => [key, booking[key]])),
    status: effectiveVenueBookingStatus(booking, now) }
}

/** SPM-87: every venue booking of the event, with its id, for marking the sign-offs on a significant change. */
export async function loadEventVenueBookings(eventId, db = getAdminDb()) {
  return rows(await db.collection(BOOKINGS).where('eventRequestId', '==', eventId).get())
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
  const organiser = inScopeAs(ORGANISER, user, event)
  const visible = bookings.filter((b) => canReadVenueBooking(user, event, b))
  if (!coordinator && !organiser && !visible.length) throw new VenueBookingError(404, 'Event not found.')
  return { event: projectRequest(user, event), canSubmit: canRequestVenue(user, event),
    bookings: await Promise.all(visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(async (b) => {
      // A dual-role user keeps their assigned staff view, but other bookings in their organisation
      // receive only the customer-facing projection.
      const staffAccess = rolesOf(user).includes(VENUE_STAFF) && b.assignedVenueStaffUid === user.uid
      if (organiser && !coordinator && !staffAccess) return presentOrganiserBooking(b, now)
      const presented = presentBooking(b, canRejectVenueBooking(user, event, b, now), canApproveVenueBooking(user, event, b, now), now,
        canCancelVenueBooking(user, event, b, now) && !b.replacedById)
      if (presented.status === BOOKING_PENDING || presented.awaitingReapproval) {
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
