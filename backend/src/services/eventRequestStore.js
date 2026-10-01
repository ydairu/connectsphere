// Firestore access for event requests. The browser has no access to this collection (firestore.rules);
// all traffic goes through the API so authorise.js can apply shared/permissions.js.
//
// Store contract, shared with the in-memory store the API tests use:
//   list()                       → request[]
//   listAssignedToCoordinator(uid) → request[] whose assignedCoordinatorUid is uid (SPM-65)
//   get(id)                      → { request, version } | null
//   update(id, patch, { version }) → { request, version }; throws StaleWriteError if the record changed
//                                  since `version` was read, so a write is never applied to a record
//                                  whose status or assignment differs from the one that was authorised.

import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '../config/firebaseAdmin.js'

export const EVENT_REQUESTS_COLLECTION = 'eventRequests'

// gRPC status codes returned by Firestore.
const NOT_FOUND = 5
const FAILED_PRECONDITION = 9

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

  async update(id, patch, { version }) {
    // FieldPath, not dotted strings, so a field name containing '.' cannot address another section.
    const pairs = Object.entries(patch).flatMap(([section, fields]) =>
      Object.entries(fields).flatMap(([field, value]) => [new FieldPath(section, field), value]),
    )
    try {
      await collection()
        .doc(id)
        .update(...pairs, 'updatedAt', FieldValue.serverTimestamp(), { lastUpdateTime: version })
    } catch (error) {
      if (error.code === FAILED_PRECONDITION || error.code === NOT_FOUND) throw new StaleWriteError(id)
      throw error
    }
    const updated = await this.get(id)
    if (!updated) throw new StaleWriteError(id)
    return updated
  },
}
