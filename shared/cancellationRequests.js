// Organiser cancellation requests — the "cancellation request is approved" path of SPM-9's Cancelled
// criterion.
//
// Pure functions: no Firebase, no I/O. Approving a request is a status transition and lives in
// shared/statusTransitions.js (APPROVE_CANCELLATION); requesting and refusing do not change the status
// and are decided here.
//
// "An Event Organiser may request cancellation; the Event Coordinator reviews and approves it."
// — Clarification 1, Cancellation. "An Organiser's cancellation request may be rejected by the Event
// Coordinator." "Cancellation for an event already approved/confirmed." — Clarification 2. No time
// boundary is set (Clarification 2), so none is applied.
//
// The current request is record metadata, stored at the top level as
//   cancellationRequest: { status, reason, requestedByUid, requestedAt, decidedByUid?, decidedAt?, decisionReason? }
// so PATCH /api/requests/:id can never write it. Every request and decision is also kept in the activity
// history, so a refused request is not lost when the Organiser asks again.

import { NOT_PERMITTED, isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import { CONFIRMED } from './status.js'

export const CANCELLATION_PENDING = 'pending'
export const CANCELLATION_APPROVED = 'approved'
export const CANCELLATION_REFUSED = 'refused'

// Reasons a cancellation request action is refused.
export const NOT_CONFIRMED = 'not_confirmed'
export const CANCELLATION_ALREADY_PENDING = 'cancellation_already_pending'
export const NO_PENDING_CANCELLATION = 'no_pending_cancellation'
export const CANCELLATION_REQUEST_PENDING = 'cancellation_request_pending'

export function hasPendingCancellation(request) {
  return request.cancellationRequest?.status === CANCELLATION_PENDING
}

/** May this user request cancellation now? The owning Organiser, a Confirmed event, none already pending. */
export function canRequestCancellation(user, request) {
  if (request.status !== CONFIRMED) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isOwningOrganiser(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (hasPendingCancellation(request)) return { allowed: false, reason: CANCELLATION_ALREADY_PENDING }
  return { allowed: true }
}

/** May this user refuse the pending request now? The assigned Coordinator, while the event is Confirmed. */
export function canRefuseCancellation(user, request) {
  if (request.status !== CONFIRMED) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isAssignedCoordinator(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (!hasPendingCancellation(request)) return { allowed: false, reason: NO_PENDING_CANCELLATION }
  return { allowed: true }
}
