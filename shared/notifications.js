// In-app notifications for cancellation — SPM-47 and SPM-63.
//
// Pure functions: no Firebase, no I/O. The backend writes the notifications this module returns into the
// `notifications` collection in the same transaction as the action (backend/src/services/notificationService.js),
// and each user reads their own through GET /api/notifications.
//
// "Notify affected users about material changes, cancellations ..." — effective-requirements.md §20.
// "Notification channel selection and user delivery preferences are team design choices." — Clarification 2.
// [Team decision pending] In-app is the only channel; there is no email, SMS or delivery preference.
//
// Who is notified:
//   request / resubmit cancellation   the assigned Coordinator                    (SPM-47)
//   return cancellation request       the owning Organiser, with the message      (SPM-47)
//   refuse cancellation               the owning Organiser, with the reason       (SPM-47)
//   cancel / approve cancellation     the owning Organiser, with the reason, and every assigned Venue Staff
//                                     and Technical Support Staff member (assignedStaffUids)  (SPM-63, SPM-47)
//                                     and every registered Attendee passed in `attendeeUids`
//   significant change at Planning /   every assigned Venue Staff and Technical Support Staff member, as
//   Confirmed                          filtered by role before the save (SPM-10)
//   equipment request approved, or   the assigned Coordinator                    (SPM-56)
//   its approval re-confirmed
//   venue booking rejected           the assigned Coordinator                    (SPM-34)
//   venue hold warning / expiry      the current assigned Coordinator            (SPM-78)
//   equipment request rejected       the assigned Coordinator, with the reason    (SPM-36)
//   approve / reject / confirm /     the owning Organiser only, with the rejection reason or the
//   return for clarification         clarification message                        (SPM-61)
// The user who acted is never notified of their own action.

import { REFUSE_CANCELLATION, REQUEST_CANCELLATION, RESUBMIT_CANCELLATION, RETURN_CANCELLATION } from './requestActions.js'
import { PLANNING, UNDER_REVIEW } from './status.js'
import { APPROVE, APPROVE_CANCELLATION, CANCEL, CONFIRM, REJECT, RETURN_FOR_CLARIFICATION } from './statusTransitions.js'

export const NOTIFICATIONS_COLLECTION = 'notifications'

export const CANCELLATION_REQUESTED_NOTICE = 'cancellation_requested'
export const CANCELLATION_RESUBMITTED_NOTICE = 'cancellation_resubmitted'
export const CANCELLATION_RETURNED_NOTICE = 'cancellation_returned'
export const CANCELLATION_REFUSED_NOTICE = 'cancellation_refused'
export const EVENT_CANCELLED_NOTICE = 'event_cancelled'
// SPM-10: a significant change reset the sign-off (and, from Confirmed, moved the event back to Planning).
export const SIGNIFICANT_CHANGE_NOTICE = 'significant_change'
// SPM-56: the assigned Technical Support Staff member approved the event's equipment request (or re-confirmed it).
export const EQUIPMENT_REQUEST_APPROVED_NOTICE = 'equipment_request_approved'
export const VENUE_BOOKING_REJECTED_NOTICE = 'venue_booking_rejected'
export const VENUE_BOOKING_APPROVED_NOTICE = 'venue_booking_approved'
export const VENUE_HOLD_WARNING_NOTICE = 'venue_hold_warning'
export const VENUE_HOLD_EXPIRED_NOTICE = 'venue_hold_expired'
// SPM-36: the assigned Technical Support Staff member rejected the event's equipment request.
export const EQUIPMENT_REQUEST_REJECTED_NOTICE = 'equipment_request_rejected'
// SPM-61: the assigned Coordinator changed the status of the Organiser's request.
export const REQUEST_APPROVED_NOTICE = 'request_approved'
export const REQUEST_REJECTED_NOTICE = 'request_rejected'
export const REQUEST_CONFIRMED_NOTICE = 'request_confirmed'
export const REQUEST_RETURNED_NOTICE = 'request_returned'

function titleOf(request) {
  const title = request.core?.title
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : 'Untitled event'
}

/**
 * The notifications to write when `actor` performs `action` on `request` (the record as it was before the
 * action), or [] for an action that notifies no one. `reason` is the reason or message the action carried;
 * for an approved cancellation request it is the Organiser's request reason. `attendeeUids` are the event's
 * registered Attendees: Attendee Registration (effective-requirements.md §18) does not exist yet, so the
 * backend has none to pass.
 */
export function cancellationNotifications(action, request, actor, { reason = null, at, attendeeUids = [] }) {
  const title = titleOf(request)
  const notices = []
  const notify = (uids, type, message) => {
    for (const uid of uids) notices.push({ recipientUid: uid, type, message, reason })
  }

  if (action === REQUEST_CANCELLATION) {
    notify([request.assignedCoordinatorUid], CANCELLATION_REQUESTED_NOTICE, `The organiser has requested cancellation of “${title}”.`)
  } else if (action === RESUBMIT_CANCELLATION) {
    notify([request.assignedCoordinatorUid], CANCELLATION_RESUBMITTED_NOTICE, `The organiser has resubmitted their cancellation request for “${title}”.`)
  } else if (action === RETURN_CANCELLATION) {
    notify([request.ownerUid], CANCELLATION_RETURNED_NOTICE, `The event coordinator needs more information about your cancellation request for “${title}”.`)
  } else if (action === REFUSE_CANCELLATION) {
    notify([request.ownerUid], CANCELLATION_REFUSED_NOTICE, `Your cancellation request for “${title}” was refused. The event remains confirmed.`)
  } else if (action === CANCEL || action === APPROVE_CANCELLATION) {
    const message =
      action === APPROVE_CANCELLATION
        ? `Your cancellation request was approved. “${title}” has been cancelled.`
        : `“${title}” has been cancelled by the event coordinator.`
    notify([request.ownerUid], EVENT_CANCELLED_NOTICE, message)
    notify(request.assignedStaffUids ?? [], EVENT_CANCELLED_NOTICE, `“${title}”, which you are assigned to, has been cancelled.`)
    notify(attendeeUids, EVENT_CANCELLED_NOTICE, `“${title}”, which you registered for, has been cancelled.`)
  }

  return addressed(notices, request, actor, title, at)
}

// One notice per recipient, never to the user who acted, never to a missing uid.
function addressed(notices, request, actor, title, at) {
  const seen = new Set()
  return notices
    .filter(({ recipientUid }) => {
      if (recipientUid == null || recipientUid === actor?.uid || seen.has(recipientUid)) return false
      seen.add(recipientUid)
      return true
    })
    .map((notice) => ({ ...notice, eventRequestId: request.id, eventTitle: title, createdAt: at, readAt: null }))
}

// The stage a request was rejected at, as SPM-45 shows it on the event page.
const REJECTED_DURING = Object.freeze({ [UNDER_REVIEW]: 'during review', [PLANNING]: 'during planning' })

/**
 * SPM-61 — the notice for the owning Organiser when `actor` approves, rejects, confirms or returns their
 * request, or [] for any other action. `request` is the record before the action; `reason` is the rejection
 * reason or the clarification message. Colleagues in the same organisation are not notified.
 */
export function statusChangeNotifications(action, request, actor, { reason = null, at }) {
  const title = titleOf(request)
  const notice = (type, message) => addressed([{ recipientUid: request.ownerUid, type, message, reason }], request, actor, title, at)

  if (action === APPROVE) {
    return notice(REQUEST_APPROVED_NOTICE, `“${title}” has been approved and moved to Planning. The event coordinator will now arrange the venue and equipment.`)
  }
  if (action === REJECT) {
    const during = REJECTED_DURING[request.status]
    return notice(REQUEST_REJECTED_NOTICE, `“${title}” has been rejected${during ? ` ${during}` : ''}.`)
  }
  if (action === CONFIRM) {
    return notice(REQUEST_CONFIRMED_NOTICE, `“${title}” is confirmed. Its required venue and technical arrangements have been approved.`)
  }
  if (action === RETURN_FOR_CLARIFICATION) {
    return notice(REQUEST_RETURNED_NOTICE, `The event coordinator returned “${title}” for clarification. Update the request and resubmit it.`)
  }
  return []
}

const STATUS_NAMES = Object.freeze({ planning: 'Planning', confirmed: 'Confirmed' })

/**
 * SPM-10 — the notices for a significant change saved on `request` (the record before the edit), to
 * `recipientUids` (assigned Venue and Technical Support Staff, filtered by role by the caller). `fieldLabels`
 * name the significant fields that changed; `status` is the event's status after the save.
 */
export function significantChangeNotifications(request, actor, { recipientUids = [], fieldLabels = [], status, at }) {
  const title = titleOf(request)
  const moved = request.status !== status
  const where = moved ? `It has moved back to ${STATUS_NAMES[status] ?? status}` : `It remains in ${STATUS_NAMES[status] ?? status}`
  const message = `“${title}” has had a significant change (${fieldLabels.join(', ')}). ${where}, and the venue and technical sign-off must be approved again.`
  const notices = recipientUids.map((uid) => ({
    recipientUid: uid,
    type: SIGNIFICANT_CHANGE_NOTICE,
    message,
    reason: null,
    changedFields: fieldLabels,
    status,
  }))
  return addressed(notices, request, actor, title, at)
}

/**
 * SPM-56 — the notice for the assigned Coordinator when `actor` approves the event's equipment request, or
 * re-confirms an approval after the technical sign-off was cleared. `event` is the record before the action.
 */
export function equipmentRequestApprovedNotifications(event, actor, { equipmentRequestId, reconfirmed = false, at }) {
  const title = titleOf(event)
  const message = reconfirmed
    ? `The equipment request for “${title}” was re-confirmed. The technical arrangement is approved again.`
    : `The equipment request for “${title}” was approved. The technical arrangement is approved.`
  const notices = [{ recipientUid: event.assignedCoordinatorUid, type: EQUIPMENT_REQUEST_APPROVED_NOTICE, message, reason: null, equipmentRequestId }]
  return addressed(notices, event, actor, title, at)
}

export function venueBookingRejectedNotifications(event, booking, actor, { reason, at }) {
  const title = titleOf(event)
  return addressed([{
    recipientUid: event.assignedCoordinatorUid,
    type: VENUE_BOOKING_REJECTED_NOTICE,
    message: `The venue booking for “${title}” at ${booking.venueName} was rejected.`,
    reason,
    bookingRequestId: booking.id,
  }], event, actor, title, at)
}

export function venueBookingApprovedNotifications(event, booking, actor, { at }) {
  const title = titleOf(event)
  return addressed([{
    recipientUid: event.assignedCoordinatorUid,
    type: VENUE_BOOKING_APPROVED_NOTICE,
    message: `The venue booking for “${title}” at ${booking.venueName} was approved. The venue is confirmed for the booked period.`,
    reason: null,
    bookingRequestId: booking.id,
  }], event, actor, title, at)
}

export function venueHoldNotifications(event, booking, kind, at) {
  const title = titleOf(event)
  const message = kind === VENUE_HOLD_WARNING_NOTICE
    ? `The tentative hold for “${title}” at ${booking.venueName} expires at ${booking.holdExpiresAt}. Ask Venue Staff to approve it before then.`
    : `The tentative hold for “${title}” at ${booking.venueName} has expired. The venue is available again; submit a new request if needed.`
  return addressed([{
    recipientUid: event.assignedCoordinatorUid,
    type: kind,
    message,
    reason: null,
    bookingRequestId: booking.id,
  }], event, null, title, at)
}

/**
 * SPM-36 — the notice for the assigned Coordinator when `actor` rejects the event's equipment request. The
 * reason is shown with it; a suggested alternative, when given, is added to the message.
 */
export function equipmentRequestRejectedNotifications(event, actor, { equipmentRequestId, reason, suggestedAlternative = null, at }) {
  const title = titleOf(event)
  const message = `The equipment request for “${title}” was rejected. Submit a revised request.${suggestedAlternative ? ` Suggested alternative: ${suggestedAlternative}` : ''}`
  const notices = [{ recipientUid: event.assignedCoordinatorUid, type: EQUIPMENT_REQUEST_REJECTED_NOTICE, message, reason, equipmentRequestId }]
  return addressed(notices, event, actor, title, at)
}
