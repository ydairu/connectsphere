// In-app notifications for event actions, including cancellation, status changes and preparation.
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
//   start preparation                assigned Venue and Technical Support Staff   (SPM-88)
//   sign-offs sent back for          the Venue Staff member of each booking sent   (SPM-87)
//   re-approval                      back, and the technical reviewers
//   safety review recorded           the assigned Coordinator, with the Safety     (SPM-92)
//                                    Officer's comments
//   attendee registers                the Attendee, with the event's start and venue (SPM-19)
//   event cancelled or rescheduled    every registered Attendee, with no reason; a reschedule carries the
//                                     new and previous start and end (SPM-41)
//   request submitted into the        every Event Coordinator Lead, with the event's start; a Returned
//   unassigned queue                  request resubmitted to its Coordinator notifies no one  (SPM-85)
// The user who acted is never notified of their own action, except the SPM-19 registration confirmation,
// which is the Attendee's own record of what they registered for.

import { REFUSE_CANCELLATION, REQUEST_CANCELLATION, RESUBMIT_CANCELLATION, RETURN_CANCELLATION } from './requestActions.js'
import { APPROVE_SAFETY, REJECT_SAFETY_ARRANGEMENT, REQUEST_SAFETY_CHANGES } from './safetyReview.js'
import { PLANNING, PREPARATION, UNDER_REVIEW } from './status.js'
import { APPROVE, APPROVE_CANCELLATION, CANCEL, CONFIRM, REJECT, RETURN_FOR_CLARIFICATION } from './statusTransitions.js'
import { eventEndsAt } from './registration.js'

export const NOTIFICATIONS_COLLECTION = 'notifications'

export const CANCELLATION_REQUESTED_NOTICE = 'cancellation_requested'
export const CANCELLATION_RESUBMITTED_NOTICE = 'cancellation_resubmitted'
export const CANCELLATION_RETURNED_NOTICE = 'cancellation_returned'
export const CANCELLATION_REFUSED_NOTICE = 'cancellation_refused'
export const EVENT_CANCELLED_NOTICE = 'event_cancelled'
export const PREPARATION_STARTED_NOTICE = 'preparation_started'
export const EVENT_STAFF_ASSIGNED_NOTICE = 'event_staff_assigned'
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
// SPM-87: the Coordinator sent sign-offs back for re-approval after a significant change.
export const SIGN_OFF_REAPPROVAL_REQUESTED_NOTICE = 'sign_off_reapproval_requested'
// SPM-92: the Safety Officer recorded the event's safety review.
export const SAFETY_APPROVED_NOTICE = 'safety_approved'
export const SAFETY_CHANGES_REQUESTED_NOTICE = 'safety_changes_requested'
export const SAFETY_REJECTED_NOTICE = 'safety_arrangement_rejected'
// SPM-41: an event a registered Attendee registered for was cancelled or rescheduled.
export const ATTENDEE_EVENT_CANCELLED_NOTICE = 'attendee_event_cancelled'
export const EVENT_RESCHEDULED_NOTICE = 'event_rescheduled'
// SPM-85: a newly submitted request is waiting in the Event Coordinator Lead's unassigned queue.
export const NEW_UNASSIGNED_REQUEST_NOTICE = 'new_unassigned_request'
// SPM-19: the Attendee's registration was confirmed.
export const REGISTRATION_CONFIRMED_NOTICE = 'registration_confirmed'

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
    notify([request.ownerUid], CANCELLATION_REFUSED_NOTICE,
      `Your cancellation request for “${title}” was refused. The event remains ${request.status === PREPARATION ? 'in Preparation' : 'Confirmed'}.`)
  } else if (action === CANCEL || action === APPROVE_CANCELLATION) {
    const message =
      action === APPROVE_CANCELLATION
        ? `Your cancellation request was approved. “${title}” has been cancelled.`
        : `“${title}” has been cancelled by the event coordinator.`
    notify([request.ownerUid], EVENT_CANCELLED_NOTICE, message)
    notify(request.assignedStaffUids ?? [], EVENT_CANCELLED_NOTICE, `“${title}”, which you are assigned to, has been cancelled.`)
  }

  // SPM-41: registered Attendees get their own notice, without the reason, which may be internal or the Organiser's.
  // E5 (team decision, 29 Oct 2026): an event can still have registrations when it is rejected — after a reschedule
  // moved it back to Planning (SPM-10, D5). For its Attendees that is a cancellation.
  const attendees = action === CANCEL || action === APPROVE_CANCELLATION || action === REJECT
    ? attendeeChangeNotifications('cancelled', request, request, actor, { attendeeUids, at })
    : []
  return [...addressed(notices, request, actor, title, at), ...attendees]
}

/**
 * SPM-41 — the notices for every registered Attendee (`attendeeUids`) when the event is cancelled or rescheduled.
 * `before` and `after` are the event before and after the change. A reschedule carries the new and previous start
 * and end, which the page shows in the reader's time zone. No reason is sent: a cancellation reason may be
 * internal or the Organiser's own. Each Attendee gets one notice, never the user who acted.
 */
export function attendeeChangeNotifications(change, before, after, actor, { attendeeUids = [], at }) {
  const title = titleOf(after)
  const cancelled = change === 'cancelled'
  const times = cancelled ? {} : {
    eventStartsAt: after.core?.preferredDateTime ?? null,
    eventEndsAt: eventEndsAt(after.core),
    previousStartsAt: before.core?.preferredDateTime ?? null,
    previousEndsAt: eventEndsAt(before.core),
  }
  const notices = attendeeUids.map((uid) => ({
    recipientUid: uid,
    type: cancelled ? ATTENDEE_EVENT_CANCELLED_NOTICE : EVENT_RESCHEDULED_NOTICE,
    changeType: change,
    message: `“${title}”, which you registered for, has been ${cancelled ? 'cancelled' : 'rescheduled'}.`,
    reason: null,
    ...times,
  }))
  return addressed(notices, after, actor, title, at)
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

/**
 * SPM-85 — the notices for the Event Coordinator Leads (`recipientUids`) when `request` (the record as submitted,
 * with its id) enters the unassigned queue. The message names the event and, when known, its organisation; the
 * event's start is carried as `eventStartsAt`, which the page shows in the reader's time zone (as SPM-19's does).
 * The page links the notice to the queue, not the event. A Lead who submitted the request is not notified.
 */
export function newUnassignedRequestNotifications(request, actor, { recipientUids = [], at }) {
  const title = titleOf(request)
  const organisation = typeof request.organisationName === 'string' ? request.organisationName.trim() : ''
  const message = `New request “${title}”${organisation ? ` from ${organisation}` : ''} is waiting for assignment.`
  return addressed(recipientUids.map((uid) => ({
    recipientUid: uid,
    type: NEW_UNASSIGNED_REQUEST_NOTICE,
    message,
    reason: null,
    eventStartsAt: request.core?.preferredDateTime ?? null,
  })), request, actor, title, at)
}

/** SPM-88: assigned Venue and Technical Support Staff learn that preparation has started. */
export function preparationStartedNotifications(request, actor, { recipientUids = [], at }) {
  const title = titleOf(request)
  return addressed(recipientUids.map((uid) => ({
    recipientUid: uid,
    type: PREPARATION_STARTED_NOTICE,
    message: `Preparation has started for “${title}”. You can update your assigned preparation section.`,
    reason: null,
  })), request, actor, title, at)
}

/** SPM-71: a saved event-level assignment appears in the selected member's inbox. */
export function eventStaffAssignedNotifications(request, assignments, at) {
  const title = titleOf(request)
  const rolesByUid = new Map()
  for (const { role, staff } of assignments) {
    if (!rolesByUid.has(staff.uid)) rolesByUid.set(staff.uid, [])
    rolesByUid.get(staff.uid).push(role === 'venue_staff' ? 'Venue Staff' : 'Technical Support Staff')
  }
  return addressed([...rolesByUid].map(([recipientUid, labels]) => ({
    recipientUid,
    type: EVENT_STAFF_ASSIGNED_NOTICE,
    message: `You have been assigned to “${title}” as ${labels.join(' and ')}.`,
    reason: null,
  })), request, { uid: null }, title, at)
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

/**
 * SPM-92 — the notice for the assigned Coordinator when `actor` records the safety review of `event` (the record
 * before the review). Approval "notifies the Coordinator"; request changes notifies them "with actionable
 * comments"; on rejection "the Coordinator receives the reason" — the comments are the notice's reason.
 * Internal notes are never sent.
 */
export function safetyReviewDecidedNotifications(event, actor, { outcome, comments = '', at }) {
  const title = titleOf(event)
  const notices = {
    [APPROVE_SAFETY]: [SAFETY_APPROVED_NOTICE, `“${title}” passed its safety check. It can be confirmed once every other confirmation condition is met.`],
    [REQUEST_SAFETY_CHANGES]: [SAFETY_CHANGES_REQUESTED_NOTICE, `The Safety Officer requested changes to “${title}”. It stays in Planning; make the changes and resubmit it for safety review.`],
    [REJECT_SAFETY_ARRANGEMENT]: [SAFETY_REJECTED_NOTICE, `The Safety Officer rejected the safety arrangement for “${title}”. The venue arrangement must be revised before another safety review; the event stays in Planning.`],
  }
  if (!notices[outcome]) return []
  const [type, message] = notices[outcome]
  return addressed([{ recipientUid: event.assignedCoordinatorUid, type, message, reason: comments || null }], event, actor, title, at)
}

/**
 * SPM-87 — the notices for the staff whose sign-offs the Coordinator sent back for re-approval. `recipients`
 * is [{ recipientUid, labels }], one entry per staff member, naming what they are asked to review again.
 */
export function signOffReapprovalNotifications(event, actor, { recipients = [], at }) {
  const title = titleOf(event)
  return addressed(recipients.map(({ recipientUid, labels }) => ({
    recipientUid,
    type: SIGN_OFF_REAPPROVAL_REQUESTED_NOTICE,
    message: `After a significant change to “${title}”, the event coordinator sent ${labels.join(', ')} back for your re-approval.`,
    reason: null,
  })), event, actor, title, at)
}

const STATUS_NAMES = Object.freeze({ planning: 'Planning', confirmed: 'Confirmed', preparation: 'Preparation' })

/**
 * SPM-10 — the notices for a significant change saved on `request` (the record before the edit), to
 * `recipientUids` (assigned Venue and Technical Support Staff, filtered by role by the caller). `fieldLabels`
 * name the significant fields that changed; `status` is the event's status after the save.
 */
export function significantChangeNotifications(request, actor, { recipientUids = [], fieldLabels = [], status, at }) {
  const title = titleOf(request)
  const moved = request.status !== status
  const where = moved ? `It has moved back to ${STATUS_NAMES[status] ?? status}` : `It remains in ${STATUS_NAMES[status] ?? status}`
  // SPM-87: the sign-offs are kept and marked "Changed since approval"; the Coordinator decides which go back.
  const message = `“${title}” has had a significant change (${fieldLabels.join(', ')}). ${where}. Recorded venue and technical sign-offs are marked "Changed since approval"; the event coordinator will decide which need re-approval.`
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

/**
 * SPM-19 — the notice confirming `attendee`'s registration for `event`, with the event information they register
 * for: its start (`eventStartsAt`, shown in the reader's time zone by the page) and its venues. Addressed to the
 * Attendee who acted, so it does not go through addressed().
 */
export function registrationConfirmedNotifications(event, attendee, { venueNames = [], at }) {
  if (!attendee?.uid) return []
  const title = titleOf(event)
  const where = venueNames.length > 0 ? ` at ${venueNames.join(', ')}` : ''
  return [{
    recipientUid: attendee.uid,
    type: REGISTRATION_CONFIRMED_NOTICE,
    message: `You are registered for “${title}”${where}.`,
    reason: null,
    eventStartsAt: event.core?.preferredDateTime ?? null,
    eventRequestId: event.id,
    eventTitle: title,
    createdAt: at,
    readAt: null,
  }]
}
