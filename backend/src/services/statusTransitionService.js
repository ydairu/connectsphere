// SPM-9 — apply an action to an event request: a status transition, an Organiser cancellation request or
// its refusal, or a venue/technical arrangement sign-off.
//
// Which actions exist, from which statuses, by whom and under what guard is decided only by the shared
// modules (shared/statusTransitions.js, shared/cancellationRequests.js, shared/arrangements.js). This file
// reads the request, asks them, and writes the change and its activity entry in one transaction, so the
// state that was checked is the state that is changed.
//
// Submit and resubmit go through submitDraftEventRequest(), which also validates mandatory fields and
// assigns the Coordinator (SPM-3, SPM-8); there is one path for them, not two.

import {
  ARRANGEMENT_NOT_REQUIRED,
  NOT_ASSIGNED_STAFF,
  NOT_AT_PLANNING,
  UNKNOWN_ARRANGEMENT,
  canDecideArrangement,
} from '../../../shared/arrangements.js'
import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_APPROVED,
  CANCELLATION_PENDING,
  CANCELLATION_REFUSED,
  CANCELLATION_REQUEST_PENDING,
  NOT_CONFIRMED,
  NO_PENDING_CANCELLATION,
  canRefuseCancellation,
  canRequestCancellation,
} from '../../../shared/cancellationRequests.js'
import { COORDINATOR, inScope, rolesOf } from '../../../shared/permissions.js'
import {
  MAX_REASON_LENGTH,
  REASON_ACCEPTED_ACTIONS,
  REASON_REQUIRED_ACTIONS,
  REFUSE_CANCELLATION,
  REQUEST_CANCELLATION,
  arrangementAction,
} from '../../../shared/requestActions.js'
import {
  APPROVE_CANCELLATION,
  ARRANGEMENTS_NOT_APPROVED,
  EVENT_NOT_ENDED,
  INSUFFICIENT_INFORMATION,
  NOT_PERMITTED,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  SUBMIT,
  TERMINAL_STATUS,
  UNKNOWN_ACTION,
  WRONG_STATUS,
  canTransition,
} from '../../../shared/statusTransitions.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EventRequestForbiddenError, EventRequestNotFoundError, submitDraftEventRequest } from './eventRequestService.js'
import { recordStatusChange, userActor } from './statusHistory.js'

export const REASON_REQUIRED = 'reason_required'
export const REASON_INVALID = 'reason_invalid'

// Activity entry types beside SPM-8's coordinator_assigned and statusHistory.js's status_changed.
export const CANCELLATION_REQUESTED = 'cancellation_requested'
export const CANCELLATION_DECIDED = 'cancellation_decided'
export const ARRANGEMENT_DECIDED = 'arrangement_decided'

const MESSAGES = Object.freeze({
  [UNKNOWN_ACTION]: 'Unknown action.',
  [TERMINAL_STATUS]: 'Completed, cancelled and rejected events cannot change status.',
  [WRONG_STATUS]: 'This action is not available at the request’s current status.',
  [NOT_PERMITTED]: 'You are not permitted to perform this action on this request.',
  [ARRANGEMENTS_NOT_APPROVED]: 'All mandatory venue and technical arrangements must be approved before confirmation.',
  [EVENT_NOT_ENDED]: 'An event can be marked complete only after it has taken place.',
  [INSUFFICIENT_INFORMATION]: 'The request is missing required details or has invalid ones. Complete them, or return it for clarification.',
  [CANCELLATION_REQUEST_PENDING]: 'The organiser has requested cancellation. Approve or refuse that request instead.',
  [NO_PENDING_CANCELLATION]: 'There is no pending cancellation request.',
  [CANCELLATION_ALREADY_PENDING]: 'A cancellation request is already awaiting the coordinator’s decision.',
  [NOT_CONFIRMED]: 'Only a confirmed event can be cancelled.',
  [NOT_AT_PLANNING]: 'Arrangements are approved or rejected while the event is in planning.',
  [NOT_ASSIGNED_STAFF]: 'Only staff assigned to this event can decide this arrangement.',
  [ARRANGEMENT_NOT_REQUIRED]: 'This event did not request equipment or technical support.',
  [UNKNOWN_ARRANGEMENT]: 'Unknown arrangement.',
  [REASON_REQUIRED]: 'A reason is required for this action.',
  [REASON_INVALID]: `A reason must be text of at most ${MAX_REASON_LENGTH} characters.`,
})

export class StatusTransitionError extends Error {
  constructor(reason) {
    super(MESSAGES[reason] ?? 'Action not allowed.')
    this.name = 'StatusTransitionError'
    this.reason = reason
  }
}

function refuse(decision) {
  if (!decision.allowed) throw new StatusTransitionError(decision.reason)
}

// The reason as stored: trimmed text, or null when none was given. Required for a Coordinator's direct
// cancellation; ignored for actions that do not take one.
function normaliseReason(action, reason) {
  if (!REASON_ACCEPTED_ACTIONS.includes(action)) return null
  if (reason !== undefined && reason !== null && typeof reason !== 'string') throw new StatusTransitionError(REASON_INVALID)
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (text.length > MAX_REASON_LENGTH) throw new StatusTransitionError(REASON_INVALID)
  if (text === '' && REASON_REQUIRED_ACTIONS.includes(action)) throw new StatusTransitionError(REASON_REQUIRED)
  return text === '' ? null : text
}

function addActivity(tx, docRef, entry) {
  tx.set(docRef.collection(ACTIVITY_SUBCOLLECTION).doc(), entry)
}

function requireRequestScope(user, request) {
  if (inScope(user, request)) return
  // Match SPM-65's read/edit refusal, after evaluating the union of all roles' scopes.
  if (rolesOf(user).includes(COORDINATOR)) throw new EventRequestNotFoundError()
  throw new EventRequestForbiddenError()
}

/**
 * Applies `action` to request `id` as `user`, and returns the updated request (unprojected — the caller
 * must pass it through presentRequest()). Out-of-scope coordinators get EventRequestNotFoundError;
 * other out-of-scope users get EventRequestForbiddenError. Neither refusal reveals request details.
 * Validation failures throw EventRequestValidationError or StatusTransitionError.
 */
export async function transitionEventRequest(id, action, user, db = getAdminDb(), now = new Date(), options = {}) {
  if (action === SUBMIT || action === RESUBMIT) {
    return transitionBySubmission(id, action, user, db, now, options)
  }

  return db.runTransaction(async (tx) => {
    const docRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()

    const existing = { id, ...snapshot.data() }
    requireRequestScope(user, existing)

    // The reason is checked only after the action itself is allowed, so a refusal names the real cause.
    const reasonFor = () => normaliseReason(action, options.reason)
    const at = now.toISOString()
    const actor = userActor(user)
    let update

    if (action === REQUEST_CANCELLATION) {
      refuse(canRequestCancellation(user, existing))
      const reason = reasonFor()
      update = {
        cancellationRequest: { status: CANCELLATION_PENDING, reason, requestedByUid: user.uid, requestedAt: at },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_REQUESTED, reason, actor, at })
    } else if (action === REFUSE_CANCELLATION) {
      refuse(canRefuseCancellation(user, existing))
      const reason = reasonFor()
      update = {
        cancellationRequest: { ...existing.cancellationRequest, status: CANCELLATION_REFUSED, decidedByUid: user.uid, decidedAt: at, decisionReason: reason },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_DECIDED, decision: CANCELLATION_REFUSED, reason, actor, at })
    } else if (arrangementAction(action)) {
      const { arrangement, decision } = arrangementAction(action)
      refuse(canDecideArrangement(user, existing, arrangement))
      update = {
        arrangementApprovals: { ...existing.arrangementApprovals, [arrangement]: { decision, byUid: user.uid, at } },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: ARRANGEMENT_DECIDED, arrangement, decision, actor, at })
    } else {
      const decision = canTransition(user, existing, action, now)
      refuse(decision)
      const reason = reasonFor()
      update = { status: decision.to, updatedAt: at }
      // SPM-25: the clarification message is kept as record metadata for the Organiser, and every earlier
      // one is kept with it, so a second return does not overwrite the first.
      if (action === RETURN_FOR_CLARIFICATION) {
        update.clarificationRequests = [
          ...(existing.clarificationRequests ?? []),
          { message: reason, requestedByUid: user.uid, requestedAt: at },
        ]
      }
      if (action === APPROVE_CANCELLATION) {
        update.cancellationRequest = { ...existing.cancellationRequest, status: CANCELLATION_APPROVED, decidedByUid: user.uid, decidedAt: at }
        addActivity(tx, docRef, { type: CANCELLATION_DECIDED, decision: CANCELLATION_APPROVED, reason: null, actor, at })
      }
      recordStatusChange(tx, docRef, {
        action,
        fromStatus: decision.from,
        toStatus: decision.to,
        actor,
        at,
        ...(reason ? { reason } : {}),
      })
    }

    tx.update(docRef, update)
    return { ...existing, ...update }
  })
}

// The action named must match the request's status: "resubmit" on a draft is refused rather than silently
// treated as "submit". The read is outside the submit transaction, which re-checks everything itself.
async function transitionBySubmission(id, action, user, db, now, options) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()

  const existing = { id, ...snapshot.data() }
  requireRequestScope(user, existing)

  refuse(canTransition(user, existing, action, now))

  return submitDraftEventRequest(id, user, db, now, options)
}
