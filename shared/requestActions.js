// Every action a user can take on an event request from its page — SPM-9.
//
// Three kinds, each decided by its own module; this file only names and combines them:
//   status transitions          shared/statusTransitions.js   (submit, approve, confirm, cancel, ...)
//   cancellation request        shared/cancellationRequests.js (request, return, resubmit, refuse;
//                                                              approving is a transition)
//   arrangement sign-off        shared/arrangements.js        (venue / technical approve or reject)
// All are sent to POST /api/event-requests/:id/transitions as { action, reason? }.

import {
  ARRANGEMENT_APPROVED,
  ARRANGEMENT_REJECTED,
  TECHNICAL_ARRANGEMENT,
  VENUE_ARRANGEMENT,
  arrangementDecision,
  decidableArrangements,
  requiredArrangements,
} from './arrangements.js'
import {
  canRefuseCancellation,
  canRequestCancellation,
  canResubmitCancellation,
  canReturnCancellation,
} from './cancellationRequests.js'
import { COORDINATOR, EQUIPMENT, VENUE, rolesOf, viewableSectionsFor } from './permissions.js'
import { isOwningOrganiser } from './requestActors.js'
import { DRAFT } from './status.js'
import { CANCEL, REJECT, RETURN_FOR_CLARIFICATION, availableActions } from './statusTransitions.js'

export const REQUEST_CANCELLATION = 'request_cancellation'
export const REFUSE_CANCELLATION = 'refuse_cancellation'
// SPM-47 — the assigned Coordinator returns a pending request for more information; the Organiser updates
// its reason and resubmits it.
export const RETURN_CANCELLATION = 'return_cancellation'
export const RESUBMIT_CANCELLATION = 'resubmit_cancellation'
export const APPROVE_VENUE = 'approve_venue'
export const REJECT_VENUE = 'reject_venue'
export const APPROVE_TECHNICAL = 'approve_technical'
export const REJECT_TECHNICAL = 'reject_technical'

const ARRANGEMENT_ACTIONS = Object.freeze({
  [APPROVE_VENUE]: { arrangement: VENUE_ARRANGEMENT, decision: ARRANGEMENT_APPROVED },
  [REJECT_VENUE]: { arrangement: VENUE_ARRANGEMENT, decision: ARRANGEMENT_REJECTED },
  [APPROVE_TECHNICAL]: { arrangement: TECHNICAL_ARRANGEMENT, decision: ARRANGEMENT_APPROVED },
  [REJECT_TECHNICAL]: { arrangement: TECHNICAL_ARRANGEMENT, decision: ARRANGEMENT_REJECTED },
})

// Coordinator-initiated cancellation is "for a stated reason". — Clarification 2, Cancellation; SPM-63.
// SPM-25: "Return action requires a clarification message from the Coordinator."
// SPM-47: the Organiser's request needs a reason; the Coordinator rejects it "with a reason" and returns it
// "with a message"; a resubmission carries the updated reason.
// SPM-45: "Rejection requires a reason."
export const REASON_REQUIRED_ACTIONS = Object.freeze([
  CANCEL,
  REJECT,
  RETURN_FOR_CLARIFICATION,
  REQUEST_CANCELLATION,
  REFUSE_CANCELLATION,
  RETURN_CANCELLATION,
  RESUBMIT_CANCELLATION,
])

// Actions that accept a reason, stored with the request or decision.
export const REASON_ACCEPTED_ACTIONS = REASON_REQUIRED_ACTIONS

export const MAX_REASON_LENGTH = 1000

/** { arrangement, decision } for an arrangement sign-off action, or null for any other action. */
export function arrangementAction(action) {
  return Object.hasOwn(ARRANGEMENT_ACTIONS, action) ? ARRANGEMENT_ACTIONS[action] : null
}

/** Every action this user may take on this request now: transitions, then cancellation, then sign-off. */
export function allAvailableActions(user, request, now = new Date(), context = {}) {
  const actions = [...availableActions(user, request, now, context)]
  if (canRequestCancellation(user, request, now).allowed) actions.push(REQUEST_CANCELLATION)
  if (canResubmitCancellation(user, request, now).allowed) actions.push(RESUBMIT_CANCELLATION)
  if (canRefuseCancellation(user, request).allowed) actions.push(REFUSE_CANCELLATION)
  if (canReturnCancellation(user, request, now).allowed) actions.push(RETURN_CANCELLATION)
  for (const arrangement of decidableArrangements(user, request)) {
    actions.push(arrangement === VENUE_ARRANGEMENT ? APPROVE_VENUE : APPROVE_TECHNICAL)
    actions.push(arrangement === VENUE_ARRANGEMENT ? REJECT_VENUE : REJECT_TECHNICAL)
  }
  return actions
}

/**
 * Sign-off state for the arrangements whose section this user may view, e.g.
 *   { venue: { required: true, decision: 'approved', at }, technical: { required: false, decision: null, at: null } }
 * or null when there is nothing to show. Who decided is internal and is not included.
 */
export function arrangementsSummary(user, request) {
  if (request.status === DRAFT) return null
  const sections = viewableSectionsFor(user, request)
  const required = requiredArrangements(request)
  const summary = {}
  for (const [arrangement, section] of [[VENUE_ARRANGEMENT, VENUE], [TECHNICAL_ARRANGEMENT, EQUIPMENT]]) {
    if (!sections.includes(section)) continue
    summary[arrangement] = {
      required: required.includes(arrangement),
      decision: arrangement === VENUE_ARRANGEMENT ? (request.venueBookingReadiness?.ready ? ARRANGEMENT_APPROVED : null) : arrangementDecision(request, arrangement),
      at: arrangement === VENUE_ARRANGEMENT ? null : request.arrangementApprovals?.[arrangement]?.at ?? null,
    }
  }
  return Object.keys(summary).length > 0 ? summary : null
}

/**
 * SPM-25 — every clarification message the Coordinator sent with a return, newest first, as the owning
 * Organiser or a Coordinator sees it, or null when there are none. Each return adds an entry to the
 * top-level `clarificationRequests` metadata, so no section edit can write it and a resubmission does not
 * erase it ([Team decision pending], effective-requirements.md §4). Who sent it is internal and is not
 * included.
 */
export function clarificationSummary(user, request) {
  const entries = Array.isArray(request.clarificationRequests) ? request.clarificationRequests : []
  if (entries.length === 0) return null
  if (!isOwningOrganiser(user, request) && !rolesOf(user).includes(COORDINATOR)) return null
  return entries.map((entry) => ({ message: entry.message, requestedAt: entry.requestedAt ?? null })).reverse()
}

/**
 * The current cancellation request as the owning Organiser or a Coordinator sees it, or null. Who decided
 * is internal and is not included.
 */
export function cancellationSummary(user, request) {
  const current = request.cancellationRequest
  if (!current) return null
  if (!isOwningOrganiser(user, request) && !rolesOf(user).includes(COORDINATOR)) return null
  return {
    status: current.status,
    reason: current.reason ?? null,
    requestedAt: current.requestedAt ?? null,
    returnMessage: current.returnMessage ?? null,
    returnedAt: current.returnedAt ?? null,
    decidedAt: current.decidedAt ?? null,
    decisionReason: current.decisionReason ?? null,
  }
}

/**
 * SPM-63 — why and when a Cancelled event was cancelled, for every user the request is presented to (the
 * caller has already checked scope), or null. Stored as top-level `cancellation` metadata in the same
 * transaction as the status change. `requestedByOrganiser` is true when the Coordinator approved the
 * Organiser's request (SPM-47), whose reason it carries. Who cancelled it is internal and is not included.
 *
 * Until a Notification System (effective-requirements.md §20) exists, this in-app notice is the only way
 * the Organiser and assigned staff learn the reason; nothing is sent to them.
 */
export function cancellationNotice(user, request) {
  const cancellation = request.cancellation
  if (!cancellation) return null
  return {
    reason: cancellation.reason ?? null,
    cancelledAt: cancellation.cancelledAt ?? null,
    requestedByOrganiser: cancellation.requestedByOrganiser === true,
  }
}

/**
 * SPM-45 — why, when and from which status a Rejected request was closed, for every user the request is
 * presented to (the caller has already checked scope), or null. Stored as top-level `rejection` metadata in
 * the same transaction as the status change, so no section edit can write it. Who rejected it is internal
 * and is not included; it is kept in `rejectedByUid` and in the `status_changed` activity entry.
 */
export function rejectionNotice(user, request) {
  const rejection = request.rejection
  if (!rejection) return null
  return {
    reason: rejection.reason ?? null,
    rejectedAt: rejection.rejectedAt ?? null,
    previousStatus: rejection.previousStatus ?? null,
  }
}

/**
 * SPM-27 — when a Completed event was marked complete, for every user the request is presented to, or null.
 * Stored as top-level `completion` metadata in the same transaction as the status change.
 * [Team decision pending, SPM-27] Who marked it complete is shown to Coordinators only, as the other
 * notices keep who decided internal; every user sees when. The `status_changed` activity entry records both.
 */
export function completionNotice(user, request) {
  const completion = request.completion
  if (!completion) return null
  const notice = { completedAt: completion.completedAt ?? null }
  if (rolesOf(user).includes(COORDINATOR)) notice.completedByName = completion.completedByName ?? null
  return notice
}
