// In-memory event request store for the API tests. Same contract as firestoreEventRequestStore,
// including the stale-write check and SPM-28's field history. Not used by the running server.
//
// `history` maps a request id to activity entries already recorded for it (e.g. the seed's
// SEED_FIELD_HISTORY), each with its `id`.

import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { StaleWriteError } from '../services/eventRequestStore.js'

export function createMemoryEventRequestStore(requests, { history = {} } = {}) {
  const records = new Map(requests.map((request) => [request.id, { data: structuredClone(request), version: 1 }]))
  const activity = new Map(Object.entries(history).map(([id, entries]) => [id, structuredClone(entries)]))
  let nextEntryId = 1

  return {
    async list() {
      return [...records.values()].map((record) => structuredClone(record.data))
    },

    async listAssignedToCoordinator(uid) {
      return [...records.values()]
        .filter((record) => record.data.assignedCoordinatorUid === uid)
        .map((record) => structuredClone(record.data))
    },

    async get(id) {
      const record = records.get(id)
      return record ? { request: structuredClone(record.data), version: record.version } : null
    },

    // The fields and their history entries are applied together or not at all, as in a transaction.
    async update(id, patch, { version, recordChanges = () => [] }) {
      const record = records.get(id)
      if (!record || record.version !== version) throw new StaleWriteError(id)

      const before = structuredClone(record.data)
      const after = structuredClone(record.data)
      for (const [section, fields] of Object.entries(patch)) {
        after[section] = { ...after[section], ...structuredClone(fields) }
      }
      const at = new Date().toISOString()
      const entries = recordChanges(before, after).map((entry) => ({ ...entry, id: `memory-activity-${nextEntryId++}`, at }))

      after.updatedAt = at
      record.data = after
      record.version += 1
      if (entries.length > 0) activity.set(id, [...(activity.get(id) ?? []), ...entries])
      return { request: structuredClone(record.data), version: record.version }
    },

    async listFieldHistory(id) {
      return structuredClone((activity.get(id) ?? []).filter((entry) => entry.type === FIELD_CHANGED))
    },
  }
}
