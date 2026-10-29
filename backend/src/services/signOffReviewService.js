// SPM-87 — the Coordinator's choice of which sign-offs changed since approval go back for re-approval.
//
// What may be chosen and what a choice writes are decided only by shared/signOffReview.js. This file reads the
// event, the chosen venue bookings and the technical reviewers, asks it, and writes the choice, the bookings
// sent back, the change history entry and the staff notices in one transaction.

import { COORDINATOR, TECHNICAL_STAFF, rolesOf } from '../../../shared/permissions.js'
import { TECHNICAL_ARRANGEMENT } from '../../../shared/arrangementDecisions.js'
import { EQUIPMENT_REQUESTS_COLLECTION } from '../../../shared/equipmentRequest.js'
import { signOffReapprovalNotifications } from '../../../shared/notifications.js'
import {
  SIGN_OFF_REVIEW_FIELD,
  canDecideSignOffReview,
  normaliseSignOffChoice,
  signOffReviewDecision,
} from '../../../shared/signOffReview.js'
import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { awaitingReapproval, BOOKING_APPROVED } from '../../../shared/venueBooking.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { USERS_COLLECTION } from './assignedCoordinatorService.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EventRequestNotFoundError, EventRequestValidationError } from './eventRequestService.js'
import { addNotifications } from './notificationService.js'
import { userActor } from './statusHistory.js'
import { StatusTransitionError, requireRequestScope } from './statusTransitionService.js'
import { BOOKINGS } from './venueBookingService.js'

export const SIGN_OFF_REVIEW_DECIDED = 'sign_off_review_decided'

// Who reviews the technical sign-off again: the current equipment request's assignee (SPM-56), or, for an
// event decided by the manual sign-off, its assigned Technical Support Staff.
async function technicalReviewerUids(tx, db, event) {
  if (event.currentEquipmentRequest?.id) {
    const request = await tx.get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(event.currentEquipmentRequest.id))
    return request.exists && request.data().assignedTechnicalStaffUid ? [request.data().assignedTechnicalStaffUid] : []
  }
  const uids = [...new Set(event.assignedStaffUids ?? [])]
  const profiles = await Promise.all(uids.map((uid) => tx.get(db.collection(USERS_COLLECTION).doc(uid))))
  return uids.filter((_uid, index) => profiles[index].exists && rolesOf(profiles[index].data()).includes(TECHNICAL_STAFF))
}

/**
 * Records `input` ({ reapprove: [itemKey, ...] }; an empty list means none need re-approval) on event `id` as
 * `user`, and returns the updated event (unprojected). Out of scope: as reading the event. Not the assigned
 * Coordinator, or nothing to decide: StatusTransitionError. An invalid choice: EventRequestValidationError,
 * after authorisation. Nothing is written when any check fails.
 */
export async function decideSignOffReview(id, input, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(eventRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const event = { id, ...snapshot.data() }
    requireRequestScope(user, event)

    const allowed = canDecideSignOffReview(user, event)
    if (!allowed.allowed) throw new StatusTransitionError(allowed.reason)
    const { value: keys, errors } = normaliseSignOffChoice(input, event.signOffReview)
    if (Object.keys(errors).length > 0) throw new EventRequestValidationError(errors)

    const at = now.toISOString()
    const decision = signOffReviewDecision(user, event, keys, at)
    // Reads first: the bookings sent back (only those still approved for this event) and the technical reviewers.
    const bookingRefs = decision.bookingIds.map((bookingId) => db.collection(BOOKINGS).doc(bookingId))
    const bookingSnapshots = await Promise.all(bookingRefs.map((ref) => tx.get(ref)))
    const technicalUids = decision.technical ? await technicalReviewerUids(tx, db, event) : []

    const labels = new Map()
    const addLabel = (uid, label) => { if (uid) labels.set(uid, [...(labels.get(uid) ?? []), label]) }
    bookingSnapshots.forEach((bookingSnapshot, index) => {
      const booking = bookingSnapshot.data()
      if (!bookingSnapshot.exists || booking.eventRequestId !== id || booking.status !== BOOKING_APPROVED || awaitingReapproval(booking)) return
      tx.update(bookingRefs[index], { reapprovalRequestedAt: at, reapprovalRequestedByUid: user.uid, updatedAt: at })
      addLabel(booking.assignedVenueStaffUid, `the venue booking at ${booking.venueName ?? 'the venue'}`)
    })
    for (const uid of technicalUids) addLabel(uid, 'the technical arrangement')

    const update = { signOffReview: decision.signOffReview, updatedAt: at }
    if (decision.technical && event.arrangementApprovals?.[TECHNICAL_ARRANGEMENT]) {
      const { [TECHNICAL_ARRANGEMENT]: _sentBack, ...kept } = event.arrangementApprovals
      update.arrangementApprovals = kept
    }
    tx.update(eventRef, update)
    const actor = userActor(user)
    const activity = eventRef.collection(ACTIVITY_SUBCOLLECTION)
    tx.set(activity.doc(), { type: SIGN_OFF_REVIEW_DECIDED, reapprove: decision.signOffReview.reapprove, actor, at })
    // AC5: the Coordinator's choice is recorded in the change history.
    tx.set(activity.doc(), { type: FIELD_CHANGED, field: SIGN_OFF_REVIEW_FIELD, ...decision.historyValues, actor: { ...actor, role: COORDINATOR }, at })
    addNotifications(tx, db, signOffReapprovalNotifications(event, user, {
      recipients: [...labels.entries()].map(([recipientUid, items]) => ({ recipientUid, labels: items })),
      at,
    }))
    return { ...event, ...update }
  })
}
