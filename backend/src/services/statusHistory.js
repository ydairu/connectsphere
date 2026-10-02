// SPM-9 — status history. Every status change is recorded in the request's `activity` subcollection, the
// same place SPM-8 records coordinator assignment, inside the transaction that changes the status.
//
// "Given a status change, when it is saved, then the system records the previous status, new status, the
// user (or system) responsible, and the date and time." — SPM-9 acceptance criteria.

import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'

export const STATUS_CHANGED = 'status_changed'

/** The actor for a signed-in user. SPM-8's SYSTEM_ACTOR is the actor for a system change. */
export function userActor(user) {
  return { type: 'user', uid: user.uid, name: user.name ?? null }
}

/**
 * Adds a status_changed entry to the request's activity, within `tx`. Write-only: call after all reads.
 * `reason` is included only when given — a Coordinator's direct cancellation always has one.
 */
export function recordStatusChange(tx, requestRef, { action, fromStatus, toStatus, actor, at, reason }) {
  tx.set(requestRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
    type: STATUS_CHANGED,
    action,
    fromStatus,
    toStatus,
    actor,
    at,
    ...(reason ? { reason } : {}),
  })
}
