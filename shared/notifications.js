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
// The user who acted is never notified of their own action.

import { REFUSE_CANCELLATION, REQUEST_CANCELLATION, RESUBMIT_CANCELLATION, RETURN_CANCELLATION } from './requestActions.js'
import { APPROVE_CANCELLATION, CANCEL } from './statusTransitions.js'

export const NOTIFICATIONS_COLLECTION = 'notifications'

export const CANCELLATION_REQUESTED_NOTICE = 'cancellation_requested'
export const CANCELLATION_RESUBMITTED_NOTICE = 'cancellation_resubmitted'
export const CANCELLATION_RETURNED_NOTICE = 'cancellation_returned'
export const CANCELLATION_REFUSED_NOTICE = 'cancellation_refused'
export const EVENT_CANCELLED_NOTICE = 'event_cancelled'

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

  // One notice per recipient, never to the user who acted, never to a missing uid.
  const seen = new Set()
  return notices
    .filter(({ recipientUid }) => {
      if (recipientUid == null || recipientUid === actor?.uid || seen.has(recipientUid)) return false
      seen.add(recipientUid)
      return true
    })
    .map((notice) => ({ ...notice, eventRequestId: request.id, eventTitle: title, createdAt: at, readAt: null }))
}
