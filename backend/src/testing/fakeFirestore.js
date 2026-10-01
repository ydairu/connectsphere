// In-memory stand-in for the Admin SDK Firestore surface the event request services use: collections,
// subcollections, `where` queries ('==', 'in', 'array-contains') and transactions. Not used by the
// running server, and not a Firestore emulator — it does not model concurrent transaction retries.
//
// Transactions buffer writes and apply them only if the callback resolves, and reject a read after a
// write as Firestore does. Each committed or aborted transaction is logged in `db.transactions` with the
// paths it read and wrote, so tests can check which documents a transaction touched.

export function createFakeFirestore(initial = {}) {
  const collections = new Map()
  const transactions = []
  let autoId = 0

  function collectionData(path) {
    if (!collections.has(path)) collections.set(path, new Map())
    return collections.get(path)
  }

  for (const [path, documents] of Object.entries(initial)) {
    const data = collectionData(path)
    for (const [id, document] of Object.entries(documents)) data.set(id, structuredClone(document))
  }

  function snapshotOf(ref) {
    const data = collectionData(ref.parentPath)
    return {
      id: ref.id,
      ref,
      exists: data.has(ref.id),
      data: () => (data.has(ref.id) ? structuredClone(data.get(ref.id)) : undefined),
    }
  }

  function matches(document, { field, op, value }) {
    const actual = document[field]
    if (op === '==') return actual === value
    if (op === 'in') return value.includes(actual)
    if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value)
    throw new Error(`fakeFirestore: unsupported operator ${op}`)
  }

  function query(path, filters) {
    return {
      path,
      isQuery: true,
      where: (field, op, value) => query(path, [...filters, { field, op, value }]),
      async get() {
        const docs = [...collectionData(path).keys()]
          .filter((id) => filters.every((filter) => matches(collectionData(path).get(id), filter)))
          .map((id) => snapshotOf(docRef(path, id)))
        return { docs, empty: docs.length === 0, size: docs.length }
      },
    }
  }

  function docRef(parentPath, id) {
    const path = `${parentPath}/${id}`
    return {
      id,
      path,
      parentPath,
      collection: (name) => collectionRef(`${path}/${name}`),
      get: async () => snapshotOf(docRef(parentPath, id)),
      set: async (document) => void collectionData(parentPath).set(id, structuredClone(document)),
      update: async (update) => {
        const data = collectionData(parentPath)
        if (!data.has(id)) throw Object.assign(new Error(`No document to update: ${path}`), { code: 5 })
        data.set(id, { ...data.get(id), ...structuredClone(update) })
      },
    }
  }

  function collectionRef(path) {
    return {
      ...query(path, []),
      doc: (id = `auto-${++autoId}`) => docRef(path, id),
      async add(document) {
        const id = `request-${collectionData(path).size + 1}`
        collectionData(path).set(id, structuredClone(document))
        return docRef(path, id)
      },
    }
  }

  return {
    transactions,
    // The eventRequests collection, keyed by id — kept for tests written against the earlier fake.
    get store() {
      return collectionData('eventRequests')
    },
    collectionData,
    collection: collectionRef,

    async runTransaction(callback) {
      const log = { reads: [], writes: [], committed: false }
      const pending = []
      transactions.push(log)

      const write = (ref, apply) => {
        log.writes.push(ref.path)
        pending.push(apply)
      }
      const tx = {
        async get(target) {
          if (pending.length > 0) throw new Error('fakeFirestore: transactions require all reads before all writes')
          log.reads.push(target.path)
          return target.get()
        },
        set: (ref, document) => write(ref, () => ref.set(document)),
        update: (ref, update) => write(ref, () => ref.update(update)),
      }

      const result = await callback(tx)
      for (const apply of pending) await apply()
      log.committed = true
      return result
    },
  }
}
