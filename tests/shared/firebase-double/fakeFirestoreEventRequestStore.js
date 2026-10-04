// The /api/requests store contract (backend/src/services/eventRequestStore.js) over a fakeFirestore's
// eventRequests collection, so the E2E double serves both route families from one set of records: a draft
// saved through /api/event-requests is the draft /api/requests lists.
//
// The version is the stored document object itself. fakeFirestore replaces that object on every write, so
// a write through either route family makes an earlier version stale, as Firestore's update time would.
//
// SPM-28: an update and its field_changed entries are written in one fakeFirestore transaction, into the
// request's `activity` subcollection, as the Firestore store does.

import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { ACTIVITY_SUBCOLLECTION } from '../../../backend/src/services/coordinatorAssignmentService.js'
import { StaleWriteError } from '../../../backend/src/services/eventRequestStore.js'

export function createFakeFirestoreEventRequestStore(getDb) {
  const records = () => getDb().collectionData('eventRequests')
  const toRequest = (id, data) => ({ id, ...structuredClone(data) })

  return {
    async list() {
      return [...records()].map(([id, data]) => toRequest(id, data))
    },

    async listAssignedToCoordinator(uid) {
      return [...records()].filter(([, data]) => data.assignedCoordinatorUid === uid).map(([id, data]) => toRequest(id, data))
    },

    async get(id) {
      const data = records().get(id)
      return data ? { request: toRequest(id, data), version: data } : null
    },

    async update(id, patch, { version, recordChanges = () => [] }) {
      const db = getDb()
      const ref = db.collection('eventRequests').doc(id)
      await db.runTransaction(async (tx) => {
        await tx.get(ref)
        const current = records().get(id)
        if (!current || current !== version) throw new StaleWriteError(id)

        const before = toRequest(id, current)
        const after = structuredClone(before)
        const update = {}
        for (const [section, fields] of Object.entries(patch)) {
          after[section] = { ...after[section], ...structuredClone(fields) }
          update[section] = after[section]
        }
        const at = new Date().toISOString()
        tx.update(ref, { ...update, updatedAt: at })
        for (const entry of recordChanges(before, after)) {
          tx.set(ref.collection(ACTIVITY_SUBCOLLECTION).doc(), { ...entry, at })
        }
      })
      const next = records().get(id)
      return { request: toRequest(id, next), version: next }
    },

    async listFieldHistory(id) {
      const activity = getDb().collectionData(`eventRequests/${id}/${ACTIVITY_SUBCOLLECTION}`)
      return [...activity].filter(([, entry]) => entry.type === FIELD_CHANGED).map(([entryId, entry]) => ({ id: entryId, ...structuredClone(entry) }))
    },
  }
}
