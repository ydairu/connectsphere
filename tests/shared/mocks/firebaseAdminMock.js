// In-memory stand-in for backend/src/config/firebaseAdmin.js: token verification plus the `users` and
// `eventRequests` Firestore collections as the backend uses them. Test files register it with
// vi.mock so the production authenticate middleware, routes and services run unchanged.

export function createFirebaseAdminFake() {
  const state = {
    users: new Map(),
    eventRequests: new Map(),
    tokens: new Map(), // token -> { uid, email, claims?, error? }
    nextId: 1,
  }

  function adminError(code, message = code) {
    return Object.assign(new Error(message), { code })
  }

  const getAdminAuth = () => ({
    async verifyIdToken(token) {
      const entry = state.tokens.get(token)
      if (!entry) throw adminError('auth/argument-error', 'Decoding Firebase ID token failed.')
      if (entry.error) throw adminError(entry.error)
      return { uid: entry.uid, email: entry.email, ...entry.claims }
    },
  })

  function collectionStore(name) {
    if (name === 'users') return state.users
    if (name === 'eventRequests') return state.eventRequests
    throw new Error(`Unexpected Firestore collection in test: ${name}`)
  }

  const getAdminDb = () => ({
    collection(name) {
      const store = collectionStore(name)
      return {
        doc: (id) => ({
          id,
          async get() {
            const data = store.get(id)
            return { id, exists: data !== undefined, data: () => structuredClone(data) }
          },
          async set(data) {
            store.set(id, structuredClone(data))
          },
          async update(fields) {
            if (!store.has(id)) throw adminError('not-found', 'No document to update')
            store.set(id, { ...store.get(id), ...structuredClone(fields) })
          },
        }),
        async add(data) {
          const id = `${name}-${state.nextId++}`
          store.set(id, structuredClone(data))
          return { id }
        },
      }
    },
  })

  function tokenFor(uid) {
    return `test-token:${uid}`
  }

  function issueToken(uid, { email, claims, error } = {}) {
    const token = error ? `${tokenFor(uid)}:${error}` : tokenFor(uid)
    state.tokens.set(token, { uid, email, claims, error })
    return token
  }

  // A signed-in account with its persisted profile: what a real user has after registration/login.
  function seedUser(account, profile) {
    const { uid, ...rest } = account
    state.users.set(uid, structuredClone(profile ?? { ...rest, role: rest.roles?.[0] }))
    return issueToken(uid, { email: account.email })
  }

  function reset() {
    state.users.clear()
    state.eventRequests.clear()
    state.tokens.clear()
    state.nextId = 1
  }

  function snapshot() {
    return {
      users: structuredClone(Object.fromEntries(state.users)),
      eventRequests: structuredClone(Object.fromEntries(state.eventRequests)),
    }
  }

  return { state, getAdminAuth, getAdminDb, tokenFor, issueToken, seedUser, reset, snapshot }
}

export const adminFake = createFirebaseAdminFake()
export const { getAdminAuth, getAdminDb } = adminFake
