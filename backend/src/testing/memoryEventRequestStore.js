// In-memory event request store for the API tests. Same contract as firestoreEventRequestStore,
// including the stale-write check. Not used by the running server.

import { StaleWriteError } from '../services/eventRequestStore.js'

export function createMemoryEventRequestStore(requests) {
  const records = new Map(requests.map((request) => [request.id, { data: structuredClone(request), version: 1 }]))

  return {
    async list() {
      return [...records.values()].map((record) => structuredClone(record.data))
    },

    async get(id) {
      const record = records.get(id)
      return record ? { request: structuredClone(record.data), version: record.version } : null
    },

    async update(id, patch, { version }) {
      const record = records.get(id)
      if (!record || record.version !== version) throw new StaleWriteError(id)
      for (const [section, fields] of Object.entries(patch)) {
        record.data[section] = { ...record.data[section], ...structuredClone(fields) }
      }
      record.data.updatedAt = new Date().toISOString()
      record.version += 1
      return { request: structuredClone(record.data), version: record.version }
    },
  }
}
