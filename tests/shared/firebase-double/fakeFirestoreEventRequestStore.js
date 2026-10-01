// The /api/requests store contract (backend/src/services/eventRequestStore.js) over a fakeFirestore's
// eventRequests collection, so the E2E double serves both route families from one set of records: a draft
// saved through /api/event-requests is the draft /api/requests lists.
//
// The version is the stored document object itself. fakeFirestore replaces that object on every write, so
// a write through either route family makes an earlier version stale, as Firestore's update time would.

import { StaleWriteError } from '../../../backend/src/services/eventRequestStore.js'

export function createFakeFirestoreEventRequestStore(getDb) {
  const records = () => getDb().collectionData('eventRequests')
  const toRequest = (id, data) => ({ id, ...structuredClone(data) })

  return {
    async list() {
      return [...records()].map(([id, data]) => toRequest(id, data))
    },

    async get(id) {
      const data = records().get(id)
      return data ? { request: toRequest(id, data), version: data } : null
    },

    async update(id, patch, { version }) {
      const current = records().get(id)
      if (!current || current !== version) throw new StaleWriteError(id)
      const next = structuredClone(current)
      for (const [section, fields] of Object.entries(patch)) {
        next[section] = { ...next[section], ...structuredClone(fields) }
      }
      next.updatedAt = new Date().toISOString()
      records().set(id, next)
      return { request: toRequest(id, next), version: next }
    },
  }
}
