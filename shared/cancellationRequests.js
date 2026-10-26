// Organiser cancellation requests — SPM-47, built on the "cancellation request is approved" path of SPM-9's
// Cancelled criterion.
//
// Pure functions: no Firebase, no I/O. Approving a request is a status transition and lives in
// shared/statusTransitions.js (APPROVE_CANCELLATION); requesting, returning, resubmitting and refusing do
// not change the status and are decided here.
//
// "An Event Organiser may request cancellation; the Event Coordinator reviews and approves it."
// — Clarification 1, Cancellation. "An Organiser's cancellation request may be rejected by the Event
// Coordinator." "Cancellation for an event already approved/confirmed." — Clarification 2.
//
// Time boundary: the customer set none and left it to the team (Clarification 2). SPM-47 and SPM-63's
// acceptance criteria set it at the event's start date/time: once `core.preferredDateTime` has passed, an
// event cannot be cancelled, a cancellation cannot be requested or resubmitted, and a pending request
// cannot be approved or returned. It can still be refused, so it does not stay open.
//
// The current request is record metadata, stored at the top level as
//   cancellationRequest: { status, reason, requestedByUid, requestedAt, resubmittedAt?,
//                          returnMessage?, returnedByUid?, returnedAt?,
//                          decidedByUid?, decidedAt?, decisionReason? }
// so PATCH /api/requests/:id can never write it. Every request and decision is also kept in the activity
// history, so a refused request is not lost when the Organiser asks again.

import { NOT_PERMITTED, isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import { registrationEligibleStatus } from './status.js'

export const CANCELLATION_PENDING = 'pending'
// SPM-47: "when the assigned Coordinator needs more information, then they can return it with a message,
// and Organiser can update and resubmit it." A returned request is still open: the Organiser cannot start
// another, and the event stays Confirmed.
export const CANCELLATION_RETURNED = 'returned'
export const CANCELLATION_APPROVED = 'approved'
export const CANCELLATION_REFUSED = 'refused'

// Reasons a cancellation request action is refused.
export const NOT_CONFIRMED = 'not_confirmed'
export const CANCELLATION_ALREADY_PENDING = 'cancellation_already_pending'
export const CANCELLATION_REQUEST_RETURNED = 'cancellation_request_returned'
export const CANCELLATION_NOT_RETURNED = 'cancellation_not_returned'
export const NO_PENDING_CANCELLATION = 'no_pending_cancellation'
export const CANCELLATION_REQUEST_PENDING = 'cancellation_request_pending'
export const EVENT_STARTED = 'event_started'

/**
 * Has the event's start date/time passed? True once `core.preferredDateTime` is at or before `now`.
 * A missing or invalid date counts as not started, so bad data never blocks a cancellation.
 */
export function eventHasStarted(request, now = new Date()) {
  const start = Date.parse(request.core?.preferredDateTime ?? '')
  return !Number.isNaN(start) && start <= now.getTime()
}

export function hasPendingCancellation(request) {
  return request.cancellationRequest?.status === CANCELLATION_PENDING
}

/** Is a request open — awaiting the Coordinator's decision, or returned to the Organiser? */
export function hasOpenCancellation(request) {
  const status = request.cancellationRequest?.status
  return status === CANCELLATION_PENDING || status === CANCELLATION_RETURNED
}

/**
 * May this user request cancellation now? The owning Organiser, a Confirmed event that has not started,
 * and no request already open.
 */
export function canRequestCancellation(user, request, now = new Date()) {
  if (!registrationEligibleStatus(request.status)) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isOwningOrganiser(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (hasPendingCancellation(request)) return { allowed: false, reason: CANCELLATION_ALREADY_PENDING }
  if (hasOpenCancellation(request)) return { allowed: false, reason: CANCELLATION_REQUEST_RETURNED }
  if (eventHasStarted(request, now)) return { allowed: false, reason: EVENT_STARTED }
  return { allowed: true }
}

/** May this user resubmit a returned request now? The owning Organiser, before the event starts. */
export function canResubmitCancellation(user, request, now = new Date()) {
  if (!registrationEligibleStatus(request.status)) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isOwningOrganiser(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (request.cancellationRequest?.status !== CANCELLATION_RETURNED) return { allowed: false, reason: CANCELLATION_NOT_RETURNED }
  if (eventHasStarted(request, now)) return { allowed: false, reason: EVENT_STARTED }
  return { allowed: true }
}

/** May this user return the pending request for more information now? The assigned Coordinator, before the event starts. */
export function canReturnCancellation(user, request, now = new Date()) {
  if (!registrationEligibleStatus(request.status)) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isAssignedCoordinator(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (!hasPendingCancellation(request)) return { allowed: false, reason: NO_PENDING_CANCELLATION }
  if (eventHasStarted(request, now)) return { allowed: false, reason: EVENT_STARTED }
  return { allowed: true }
}

/**
 * May this user refuse the open request now? The assigned Coordinator, while the event is Confirmed. A
 * returned request may be refused too, and so may one whose event has started, so no request is left open
 * with nothing the Coordinator can do about it.
 */
export function canRefuseCancellation(user, request) {
  if (!registrationEligibleStatus(request.status)) return { allowed: false, reason: NOT_CONFIRMED }
  if (!isAssignedCoordinator(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (!hasOpenCancellation(request)) return { allowed: false, reason: NO_PENDING_CANCELLATION }
  return { allowed: true }
}
