// SPM-9 — apply an action to an event request: a status transition, an Organiser cancellation request and
// the Coordinator's return or refusal of it (SPM-47), or a venue/technical arrangement sign-off.
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
  EQUIPMENT_REQUEST_DECIDES,
  NOT_ASSIGNED_STAFF,
  NOT_AT_PLANNING,
  UNKNOWN_ARRANGEMENT,
  VENUE_BOOKINGS_DECIDE,
  canDecideArrangement,
} from '../../../shared/arrangements.js'
import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_APPROVED,
  CANCELLATION_NOT_RETURNED,
  CANCELLATION_PENDING,
  CANCELLATION_REFUSED,
  CANCELLATION_REQUEST_PENDING,
  CANCELLATION_REQUEST_RETURNED,
  CANCELLATION_RETURNED,
  EVENT_STARTED,
  NOT_CONFIRMED,
  NO_PENDING_CANCELLATION,
  canRefuseCancellation,
  canRequestCancellation,
  canResubmitCancellation,
  canReturnCancellation,
} from '../../../shared/cancellationRequests.js'
import { COORDINATOR, TECHNICAL_STAFF, VENUE_STAFF, inScope, rolesOf } from '../../../shared/permissions.js'
import {
  MAX_REASON_LENGTH,
  REASON_ACCEPTED_ACTIONS,
  REASON_REQUIRED_ACTIONS,
  REFUSE_CANCELLATION,
  REQUEST_CANCELLATION,
  RESUBMIT_CANCELLATION,
  RETURN_CANCELLATION,
  arrangementAction,
} from '../../../shared/requestActions.js'
import {
  APPROVE_CANCELLATION,
  ARRANGEMENTS_NOT_APPROVED,
  CANCEL,
  CONFIRM,
  COMPLETE,
  SAFETY_APPROVAL_REQUIRED,
  START_PREPARATION,
  EVENT_NOT_ENDED,
  INSUFFICIENT_INFORMATION,
  NOT_PERMITTED,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  SUBMIT,
  TERMINAL_STATUS,
  UNKNOWN_ACTION,
  WRONG_STATUS,
  canTransition,
} from '../../../shared/statusTransitions.js'
import { cancellationNotifications, preparationStartedNotifications } from '../../../shared/notifications.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EventRequestForbiddenError, EventRequestNotFoundError, submitDraftEventRequest } from './eventRequestService.js'
import { addNotifications } from './notificationService.js'
import { recordStatusChange, userActor } from './statusHistory.js'
import { loadVenueBookingReadiness, prepareVenueHoldRelease } from './venueBookingService.js'
import { prepareEquipmentRequestClose } from './equipmentRequestService.js'
import { USERS_COLLECTION } from './assignedCoordinatorService.js'

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
  [SAFETY_APPROVAL_REQUIRED]: 'A valid safety approval is required before preparation can start.',
  [CANCELLATION_REQUEST_PENDING]: 'The organiser has an open cancellation request. Decide that request instead.',
  [NO_PENDING_CANCELLATION]: 'There is no pending cancellation request.',
  [CANCELLATION_ALREADY_PENDING]: 'A cancellation request is already awaiting the coordinator’s decision.',
  [CANCELLATION_REQUEST_RETURNED]: 'The coordinator returned your cancellation request. Update and resubmit it instead.',
  [CANCELLATION_NOT_RETURNED]: 'There is no returned cancellation request to resubmit.',
  [EVENT_STARTED]: 'The event’s start date/time has passed, so it can no longer be cancelled.',
  [NOT_CONFIRMED]: 'Only a Confirmed or Preparation event can be cancelled.',
  [NOT_AT_PLANNING]: 'Arrangements are approved or rejected while the event is in planning.',
  [NOT_ASSIGNED_STAFF]: 'Only staff assigned to this event can decide this arrangement.',
  [ARRANGEMENT_NOT_REQUIRED]: 'This event did not request equipment or technical support.',
  [EQUIPMENT_REQUEST_DECIDES]: 'The technical arrangement is decided by reviewing the event\'s equipment request.',
  [UNKNOWN_ARRANGEMENT]: 'Unknown arrangement.',
  [VENUE_BOOKINGS_DECIDE]: 'Venue approval is decided on each booking request.',
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

// The reason as stored: trimmed text, or null when none was given. Required for every action in
// REASON_REQUIRED_ACTIONS; ignored for actions that do not take one.
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

/**
 * Refuses a user who may not see the request: 404 for anyone holding the Coordinator role (SPM-65 — another
 * Coordinator's event is not confirmed to exist), 403 for everyone else. Shared with SPM-26 reassignment.
 */
export function requireRequestScope(user, request) {
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

    // SPM-91/92 must provide this server-side verifier. It is never read from the HTTP request body.
    // Without it, Start Preparation fails closed, including for old Confirmed records.
    const safetyApproved = action === START_PREPARATION && typeof options.verifySafetyApproval === 'function'
      ? await options.verifySafetyApproval(existing, db, tx) === true
      : false
    const preparationRecipients = action === START_PREPARATION
      ? await assignedPreparationRecipients(tx, db, existing, user)
      : []

    // The reason is checked only after the action itself is allowed, so a refusal names the real cause.
    const reasonFor = () => normaliseReason(action, options.reason)
    const at = now.toISOString()
    const actor = userActor(user)
    let update

    if (action === REQUEST_CANCELLATION) {
      refuse(canRequestCancellation(user, existing, now))
      const reason = reasonFor()
      update = {
        cancellationRequest: { status: CANCELLATION_PENDING, reason, requestedByUid: user.uid, requestedAt: at },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_REQUESTED, action, reason, actor, at })
    } else if (action === RESUBMIT_CANCELLATION) {
      // SPM-47: the Organiser updates the reason and sends the same request back to the Coordinator.
      refuse(canResubmitCancellation(user, existing, now))
      const reason = reasonFor()
      update = {
        cancellationRequest: { ...existing.cancellationRequest, status: CANCELLATION_PENDING, reason, resubmittedAt: at },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_REQUESTED, action, reason, actor, at })
    } else if (action === RETURN_CANCELLATION) {
      refuse(canReturnCancellation(user, existing, now))
      const reason = reasonFor()
      update = {
        cancellationRequest: { ...existing.cancellationRequest, status: CANCELLATION_RETURNED, returnMessage: reason, returnedByUid: user.uid, returnedAt: at },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_DECIDED, action, decision: CANCELLATION_RETURNED, reason, actor, at })
    } else if (action === REFUSE_CANCELLATION) {
      refuse(canRefuseCancellation(user, existing))
      const reason = reasonFor()
      update = {
        cancellationRequest: { ...existing.cancellationRequest, status: CANCELLATION_REFUSED, decidedByUid: user.uid, decidedAt: at, decisionReason: reason },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: CANCELLATION_DECIDED, action, decision: CANCELLATION_REFUSED, reason, actor, at })
    } else if (arrangementAction(action)) {
      const { arrangement, decision } = arrangementAction(action)
      refuse(canDecideArrangement(user, existing, arrangement))
      update = {
        arrangementApprovals: { ...existing.arrangementApprovals, [arrangement]: { decision, byUid: user.uid, at } },
        updatedAt: at,
      }
      addActivity(tx, docRef, { type: ARRANGEMENT_DECIDED, arrangement, decision, actor, at })
    } else {
      const readiness = action === CONFIRM ? await loadVenueBookingReadiness(id, db, now, tx) : null
      const decision = canTransition(user, readiness ? { ...existing, venueBookingReadiness: readiness } : existing, action, now, { safetyApproved })
      refuse(decision)
      const reason = reasonFor()
      update = { status: decision.to, updatedAt: at }
      // Read release data before status/history writes; only actual terminal actions release holds (SPM-14)
      // and close Pending Review and Approved equipment requests (SPM-17, SPM-56). Both read first, then both
      // write, because a transaction may not read after it has written. Closing returns the event's summary
      // change, which is written with this update rather than as a second write to the event.
      const terminal = [REJECT, CANCEL, APPROVE_CANCELLATION].includes(action)
      const releaseHolds = terminal ? await prepareVenueHoldRelease(tx, db, id, user, now) : null
      const closeEquipmentRequests = terminal
        ? await prepareEquipmentRequestClose(tx, db, id, user, now, action === REJECT ? 'event_rejected' : 'event_cancelled', existing.currentEquipmentRequest ?? null)
        : null
      if (releaseHolds) releaseHolds()
      if (closeEquipmentRequests) Object.assign(update, closeEquipmentRequests())
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
        addActivity(tx, docRef, { type: CANCELLATION_DECIDED, action, decision: CANCELLATION_APPROVED, reason: null, actor, at })
      }
      // SPM-63: what "Cancelled" records, whichever path led there. The reason is the Coordinator's own, or
      // the Organiser's request reason when the Coordinator approved it (SPM-47).
      if (action === CANCEL || action === APPROVE_CANCELLATION) {
        update.cancellation = {
          reason: action === CANCEL ? reason : existing.cancellationRequest?.reason ?? null,
          requestedByOrganiser: action === APPROVE_CANCELLATION,
          cancelledByUid: user.uid,
          cancelledAt: at,
        }
      }
      // SPM-45: what "Rejected" records. The deciding Coordinator, the new status and the time are also in the
      // status_changed entry below.
      if (action === REJECT) {
        update.rejection = { reason, previousStatus: decision.from, rejectedByUid: user.uid, rejectedAt: at }
      }
      // SPM-27: who marked the event complete and when, kept with the record for later reference.
      if (action === COMPLETE) {
        update.completion = { completedByUid: user.uid, completedByName: user.name ?? null, completedAt: at }
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

    // SPM-47, SPM-63 — notify the affected users in the same transaction, so a notice exists only for an
    // action that was saved. An approval carries the Organiser's request reason. No Attendee uids are passed:
    // Attendee Registration does not exist yet (shared/notifications.js).
    const noticeReason = action === APPROVE_CANCELLATION ? existing.cancellationRequest?.reason ?? null : reasonFor()
    addNotifications(tx, db, cancellationNotifications(action, existing, user, { reason: noticeReason, at }))
    if (action === START_PREPARATION) {
      addNotifications(tx, db, preparationStartedNotifications(existing, user, { recipientUids: preparationRecipients, at }))
    }

    tx.update(docRef, update)
    return { ...existing, ...update }
  })
}

async function assignedPreparationRecipients(tx, db, request, actor) {
  const uids = [...new Set(request.assignedStaffUids ?? [])].filter((uid) => uid && uid !== actor.uid)
  const profiles = await Promise.all(uids.map((uid) => tx.get(db.collection(USERS_COLLECTION).doc(uid))))
  return uids.filter((_uid, index) => profiles[index].exists &&
    rolesOf(profiles[index].data()).some((role) => role === VENUE_STAFF || role === TECHNICAL_STAFF))
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
