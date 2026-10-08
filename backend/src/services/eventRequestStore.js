// Firestore access for event requests. The browser has no access to this collection (firestore.rules);
// all traffic goes through the API so authorise.js can apply shared/permissions.js.
//
// Store contract, shared with the in-memory store the API tests use:
//   list()                       → request[]
//   listAssignedToCoordinator(uid) → request[] whose assignedCoordinatorUid is uid (SPM-65)
//   get(id)                      → { request, version } | null
//   update(id, patch, { version, recordChanges?, consequences? })
//                                → { request, version }; throws StaleWriteError if the record changed
//                                  since `version` was read, so a write is never applied to a record
//                                  whose status or assignment differs from the one that was authorised.
//                                  recordChanges(before, after) (SPM-28) returns activity entries, which
//                                  are written with `at` in the same transaction as the fields, so a
//                                  failed save leaves no entries and a successful one always has them.
//                                  consequences(before, after) (SPM-10) returns { metadata, activity,
//                                  notifications }: top-level fields written with the edit (status,
//                                  arrangementApprovals), activity entries written as given (with their
//                                  own `at`), and notifications added to the notifications collection —
//                                  all in the same transaction.
//   listFieldHistory(id)         → the request's field_changed activity entries, each with its `id` (SPM-28)

import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { addNotifications } from './notificationService.js'

export const EVENT_REQUESTS_COLLECTION = 'eventRequests'

export class StaleWriteError extends Error {
  constructor(id) {
    super(`Event request ${id} changed or was removed before the update was applied`)
    this.name = 'StaleWriteError'
  }
}

function serialise(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serialise)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, serialise(inner)]))
  }
  return value
}

function toRequest(snapshot) {
  return { id: snapshot.id, ...serialise(snapshot.data()) }
}

function collection() {
  return getAdminDb().collection(EVENT_REQUESTS_COLLECTION)
}

export const firestoreEventRequestStore = {
  async list() {
    const snapshot = await collection().get()
    return snapshot.docs.map(toRequest)
  },

  async listAssignedToCoordinator(uid) {
    const snapshot = await collection().where('assignedCoordinatorUid', '==', uid).get()
    return snapshot.docs.map(toRequest)
  },

  async get(id) {
    const snapshot = await collection().doc(id).get()
    return snapshot.exists ? { request: toRequest(snapshot), version: snapshot.updateTime } : null
  },

  async update(id, patch, { version, recordChanges = () => [], consequences = () => ({}) }) {
    // FieldPath, not dotted strings, so a field name containing '.' cannot address another section.
    const pairs = Object.entries(patch).flatMap(([section, fields]) =>
      Object.entries(fields).flatMap(([field, value]) => [new FieldPath(section, field), value]),
    )
    const ref = collection().doc(id)
    await getAdminDb().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      // The same stale-write rule the lastUpdateTime precondition enforced before SPM-28.
      if (!snapshot.exists || !snapshot.updateTime.isEqual(version)) throw new StaleWriteError(id)

      const before = toRequest(snapshot)
      const after = { ...before }
      for (const [section, fields] of Object.entries(patch)) after[section] = { ...before[section], ...fields }

      const changes = recordChanges(before, after)
      const { metadata = {}, activity = [], notifications = [] } = consequences(before, after)
      const metadataPairs = Object.entries(metadata).flatMap(([key, value]) => [new FieldPath(key), value])

      tx.update(ref, ...pairs, ...metadataPairs, 'updatedAt', FieldValue.serverTimestamp())
      for (const entry of changes) {
        tx.set(ref.collection(ACTIVITY_SUBCOLLECTION).doc(), { ...entry, at: FieldValue.serverTimestamp() })
      }
      for (const entry of activity) tx.set(ref.collection(ACTIVITY_SUBCOLLECTION).doc(), entry)
      addNotifications(tx, getAdminDb(), notifications)
    })
    const updated = await this.get(id)
    if (!updated) throw new StaleWriteError(id)
    return updated
  },

  async listFieldHistory(id) {
    const snapshot = await collection().doc(id).collection(ACTIVITY_SUBCOLLECTION).where('type', '==', FIELD_CHANGED).get()
    return snapshot.docs.map(toRequest)
  },
}
