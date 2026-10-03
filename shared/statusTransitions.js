// Event lifecycle transitions — SPM-9.
//
// Pure functions: no Firebase, no I/O. The backend applies a transition inside a transaction and records
// it in the request's `activity` subcollection; the frontend uses availableActions() to decide which
// buttons to show (UX only — the backend re-checks with canTransition()).
//
// A caller asks for an *action*, never a target status, so a client cannot request an arbitrary jump.
// Status changes are separate from section edits: they never pass through permissions.js's state gate.
//
// Sources: SPM-9 acceptance criteria (Product Backlog); Clarification 2, Event Lifecycle, Rejection, and
// Cancellation; Clarification 1, Review, Statuses, and Changes. Rules marked [Team decision] are
// choices the criteria left open, confirmed by the team on 1 Oct 2026 (effective-requirements.md §6).

import { arrangementsApproved } from './arrangements.js'
import { hasValidationErrors, validateEventRequestSubmission } from './eventRequest.js'
import {
  CANCELLATION_REQUEST_PENDING,
  EVENT_STARTED,
  NO_PENDING_CANCELLATION,
  eventHasStarted,
  hasOpenCancellation,
  hasPendingCancellation,
} from './cancellationRequests.js'
import { NOT_PERMITTED, isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  REJECTED,
  RETURNED,
  SUBMITTED,
  UNDER_REVIEW,
} from './status.js'

// --- Actions --------------------------------------------------------------------------------------

export const SUBMIT = 'submit'
export const RESUBMIT = 'resubmit'
export const START_REVIEW = 'start_review'
export const RETURN_FOR_CLARIFICATION = 'return_for_clarification'
export const APPROVE = 'approve'
export const CONFIRM = 'confirm'
export const REJECT = 'reject'
export const COMPLETE = 'complete'
export const CANCEL = 'cancel'
export const APPROVE_CANCELLATION = 'approve_cancellation'

// "Completed, Cancelled and Rejected are terminal states." — SPM-9 acceptance criteria.
export const TERMINAL_STATUSES = Object.freeze([COMPLETED, CANCELLED, REJECTED])

// --- Reasons a transition is refused --------------------------------------------------------------

export const UNKNOWN_ACTION = 'unknown_action'
export const TERMINAL_STATUS = 'terminal_status'
export const WRONG_STATUS = 'wrong_status'
export { NOT_PERMITTED }
export const ARRANGEMENTS_NOT_APPROVED = 'arrangements_not_approved'
export const EVENT_NOT_ENDED = 'event_not_ended'
export const INSUFFICIENT_INFORMATION = 'insufficient_information'
export { EVENT_STARTED }

// --- Guards ---------------------------------------------------------------------------------------
// Actors (owning Organiser, assigned Coordinator) are in shared/requestActors.js. The Confirm guard,
// arrangementsApproved(), is in shared/arrangements.js and re-exported here.

export { arrangementsApproved, eventHasStarted }

/**
 * Has the event taken place? True once preferredDateTime + durationHours is at or before `now`.
 * Missing or invalid values count as not ended.
 *
 * "Completed: event date/time has passed." — Clarification 2, Event Lifecycle.
 * [Team decision, 1 Oct 2026] The assigned Coordinator marks completion manually once the event has ended;
 * an automatic system job is deferred.
 */
export function eventHasEnded(request, now = new Date()) {
  const start = Date.parse(request.core?.preferredDateTime ?? '')
  const hours = request.core?.durationHours
  if (Number.isNaN(start) || typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) return false
  return start + hours * 60 * 60 * 1000 <= now.getTime()
}

/**
 * Does the request still hold the information a submission needs? The same check as SPM-3's submit
 * (validateEventRequestSubmission): mandatory fields present and every field well-formed.
 *
 * SPM-5: "Given a request in Under Review with sufficient information, when the assigned Event Coordinator
 * approves it, then its status changes to Planning." Section edits after submission are not validated
 * (AGENTS.md §6), so a required field can be cleared while the request is Under Review.
 * [Engineering recommendation, SPM-5] This is the minimum; whether the information is sufficient beyond it
 * is the Coordinator's judgement, and Return for Clarification (SPM-25) is the action for that.
 */
export function hasSufficientInformation(request) {
  return !hasValidationErrors(validateEventRequestSubmission(request).errors)
}

// --- Transition table -----------------------------------------------------------------------------

const TRANSITIONS = Object.freeze({
  // "Given an event in Draft, when the Organiser submits, then it moves to Submitted." Mandatory-field
  // validation is separate: validateEventRequestSubmission() in shared/eventRequest.js (SPM-3).
  [SUBMIT]: { from: [DRAFT], to: SUBMITTED, actor: isOwningOrganiser },
  // "When the Organiser resubmits, it moves back to Submitted."
  [RESUBMIT]: { from: [RETURNED], to: SUBMITTED, actor: isOwningOrganiser },
  // "Given an event in Submitted, when the Coordinator starts reviewing, then it moves to Under Review."
  [START_REVIEW]: { from: [SUBMITTED], to: UNDER_REVIEW, actor: isAssignedCoordinator },
  // "Given an event in Under Review, when the Coordinator requests clarification or amendments, then it
  // moves to Returned."
  [RETURN_FOR_CLARIFICATION]: { from: [UNDER_REVIEW], to: RETURNED, actor: isAssignedCoordinator },
  // "Given an event in Under Review, when the Coordinator approves, then it moves to Planning."
  // SPM-5: only "with sufficient information" — see hasSufficientInformation().
  [APPROVE]: {
    from: [UNDER_REVIEW],
    to: PLANNING,
    actor: isAssignedCoordinator,
    guard: (request) => (hasSufficientInformation(request) ? null : INSUFFICIENT_INFORMATION),
  },
  // "Given an event is in Planning and all mandatory venue and required technical arrangements have been
  // approved, when the assigned Event Coordinator confirms it, then its status changes to Confirmed."
  [CONFIRM]: {
    from: [PLANNING],
    to: CONFIRMED,
    actor: isAssignedCoordinator,
    guard: (request) => (arrangementsApproved(request) ? null : ARRANGEMENTS_NOT_APPROVED),
  },
  // "Given an event is Under Review or Planning and its essential requirements cannot be fulfilled, when
  // the assigned Event Coordinator rejects it, then its status changes to Rejected."
  [REJECT]: { from: [UNDER_REVIEW, PLANNING], to: REJECTED, actor: isAssignedCoordinator },
  // "Given a Confirmed event that has taken place, when marked complete, then it moves to Completed."
  [COMPLETE]: {
    from: [CONFIRMED],
    to: COMPLETED,
    actor: isAssignedCoordinator,
    guard: (request, now) => (eventHasEnded(request, now) ? null : EVENT_NOT_ENDED),
  },
  // "Given a Confirmed event, when ... the Coordinator cancels it directly, then it moves to Cancelled."
  // Coordinator-initiated cancellation is "for a stated reason" (Clarification 2): the API requires one.
  // SPM-63: "only a Confirmed event, up to its start date/time." While an Organiser's request is open
  // (pending, or returned for more information), the Coordinator decides it instead (SPM-47).
  [CANCEL]: {
    from: [CONFIRMED],
    to: CANCELLED,
    actor: isAssignedCoordinator,
    guard: (request, now) =>
      eventHasStarted(request, now) ? EVENT_STARTED : hasOpenCancellation(request) ? CANCELLATION_REQUEST_PENDING : null,
  },
  // "Given a Confirmed event, when a cancellation request is approved ..., then it moves to Cancelled."
  // SPM-47: "when the event's start date/time passes before a decision, then it can no longer be approved."
  // Requesting, returning and refusing are in shared/cancellationRequests.js; they do not change the status.
  [APPROVE_CANCELLATION]: {
    from: [CONFIRMED],
    to: CANCELLED,
    actor: isAssignedCoordinator,
    guard: (request, now) =>
      !hasPendingCancellation(request) ? NO_PENDING_CANCELLATION : eventHasStarted(request, now) ? EVENT_STARTED : null,
  },
})

export const ACTIONS = Object.freeze(Object.keys(TRANSITIONS))

/** The status `action` leads to, or null for an unknown action. */
export function targetStatus(action) {
  return Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action].to : null
}

/**
 * May this user perform `action` on this request now? Returns { allowed: true, from, to } or
 * { allowed: false, reason } with one of the reason constants above.
 *
 * Checks run in this order: action exists, request is not terminal, request is at an allowed status,
 * user is a permitted actor, guard passes. A multi-role user is permitted if any of their roles is.
 */
export function canTransition(user, request, action, now = new Date()) {
  if (!Object.hasOwn(TRANSITIONS, action)) return { allowed: false, reason: UNKNOWN_ACTION }
  // "Given an event in Completed, Cancelled or Rejected, when any user attempts a status change, then it
  // is not allowed." Also true by construction — no action lists a terminal status in `from`.
  if (TERMINAL_STATUSES.includes(request.status)) return { allowed: false, reason: TERMINAL_STATUS }

  const transition = TRANSITIONS[action]
  if (!transition.from.includes(request.status)) return { allowed: false, reason: WRONG_STATUS }
  if (!transition.actor(user, request)) return { allowed: false, reason: NOT_PERMITTED }

  const refusal = transition.guard?.(request, now)
  if (refusal) return { allowed: false, reason: refusal }

  return { allowed: true, from: request.status, to: transition.to }
}

/** Actions this user may perform on this request now, in table order. Drives the UI only. */
export function availableActions(user, request, now = new Date()) {
  return ACTIONS.filter((action) => canTransition(user, request, action, now).allowed)
}
