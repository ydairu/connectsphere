// Every action a user can take on an event request from its page — SPM-9.
//
// Three kinds, each decided by its own module; this file only names and combines them:
//   status transitions          shared/statusTransitions.js   (submit, approve, confirm, cancel, ...)
//   cancellation request        shared/cancellationRequests.js (request, refuse; approving is a transition)
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
import { canRefuseCancellation, canRequestCancellation } from './cancellationRequests.js'
import { COORDINATOR, EQUIPMENT, VENUE, rolesOf, viewableSectionsFor } from './permissions.js'
import { isOwningOrganiser } from './requestActors.js'
import { DRAFT } from './status.js'
import { CANCEL, availableActions } from './statusTransitions.js'

export const REQUEST_CANCELLATION = 'request_cancellation'
export const REFUSE_CANCELLATION = 'refuse_cancellation'
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

// Coordinator-initiated cancellation is "for a stated reason". — Clarification 2, Cancellation.
export const REASON_REQUIRED_ACTIONS = Object.freeze([CANCEL])

// Actions that accept an optional reason, stored with the request or decision.
export const REASON_ACCEPTED_ACTIONS = Object.freeze([CANCEL, REQUEST_CANCELLATION, REFUSE_CANCELLATION])

export const MAX_REASON_LENGTH = 1000

/** { arrangement, decision } for an arrangement sign-off action, or null for any other action. */
export function arrangementAction(action) {
  return Object.hasOwn(ARRANGEMENT_ACTIONS, action) ? ARRANGEMENT_ACTIONS[action] : null
}

/** Every action this user may take on this request now: transitions, then cancellation, then sign-off. */
export function allAvailableActions(user, request, now = new Date()) {
  const actions = [...availableActions(user, request, now)]
  if (canRequestCancellation(user, request).allowed) actions.push(REQUEST_CANCELLATION)
  if (canRefuseCancellation(user, request).allowed) actions.push(REFUSE_CANCELLATION)
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
      decision: arrangementDecision(request, arrangement),
      at: request.arrangementApprovals?.[arrangement]?.at ?? null,
    }
  }
  return Object.keys(summary).length > 0 ? summary : null
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
    decidedAt: current.decidedAt ?? null,
    decisionReason: current.decisionReason ?? null,
  }
}
