// In-memory stand-in for the Firebase client SDK surface used by frontend/src/context/AuthContext.jsx.
// Registered through vi.mock in tests/shared/setup/jsdom.setup.js, so every jsdom test in tests/ runs
// the real AuthProvider against this fake and never touches Firebase.
//
// Behaviour mirrors Firebase Auth where the application depends on it: error codes, the auth-state
// listener firing on sign-in/sign-out, and account creation making the new user the current user.

import { TEST_PASSWORD, profileOf } from '../fixtures/testUsers.js'

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function firebaseError(code) {
  return Object.assign(new Error(code), { code })
}

export function createFirebaseFake() {
  const state = {
    accounts: new Map(), // lower-cased email -> { uid, email, password, displayName }
    profiles: new Map(), // uid -> users/{uid} document
    listeners: new Set(),
    auth: { currentUser: null },
    calls: null,
    failNextSetDoc: null,
    nextUid: 1,
  }

  function resetCalls() {
    state.calls = { signIn: [], createUser: [], updateProfile: [], deleteUser: [], setDoc: [], signOut: 0 }
  }

  function makeUser(account) {
    return {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName ?? null,
      getIdToken: async () => `test-token:${account.uid}`,
    }
  }

  async function setCurrentUser(user) {
    state.auth.currentUser = user
    for (const listener of state.listeners) await listener(user)
  }

  function accountByUid(uid) {
    return [...state.accounts.values()].find((account) => account.uid === uid)
  }

  function validateEmail(email) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) throw firebaseError('auth/invalid-email')
  }

  const authModule = {
    getAuth: () => state.auth,
    onAuthStateChanged(_auth, listener) {
      state.listeners.add(listener)
      listener(state.auth.currentUser)
      return () => state.listeners.delete(listener)
    },
    async signInWithEmailAndPassword(_auth, email, password) {
      state.calls.signIn.push({ email, password })
      validateEmail(email)
      if (!password) throw firebaseError('auth/missing-password')
      const account = state.accounts.get(email.toLowerCase())
      if (!account || account.password !== password) throw firebaseError('auth/invalid-credential')
      const user = makeUser(account)
      await setCurrentUser(user)
      return { user }
    },
    async createUserWithEmailAndPassword(_auth, email, password) {
      state.calls.createUser.push({ email, password })
      validateEmail(email)
      if (!password) throw firebaseError('auth/missing-password')
      if (password.length < 6) throw firebaseError('auth/weak-password')
      if (state.accounts.has(email.toLowerCase())) throw firebaseError('auth/email-already-in-use')
      const account = { uid: `fake-uid-${state.nextUid++}`, email, password, displayName: null }
      state.accounts.set(email.toLowerCase(), account)
      const user = makeUser(account)
      await setCurrentUser(user)
      return { user }
    },
    async updateProfile(user, { displayName }) {
      state.calls.updateProfile.push({ uid: user.uid, displayName })
      const account = accountByUid(user.uid)
      if (account) account.displayName = displayName
      user.displayName = displayName
    },
    async deleteUser(user) {
      state.calls.deleteUser.push(user.uid)
      const account = accountByUid(user.uid)
      if (account) state.accounts.delete(account.email.toLowerCase())
      if (state.auth.currentUser?.uid === user.uid) await setCurrentUser(null)
    },
    async signOut() {
      state.calls.signOut += 1
      await setCurrentUser(null)
    },
  }

  const firestoreModule = {
    getFirestore: () => ({}),
    doc: (_db, collection, id) => ({ collection, id }),
    async getDoc({ collection, id }) {
      if (collection !== 'users') throw firebaseError('permission-denied')
      const data = state.profiles.get(id)
      return { id, exists: () => data !== undefined, data: () => structuredClone(data) }
    },
    async setDoc({ collection, id }, data) {
      state.calls.setDoc.push({ collection, id, data: structuredClone(data) })
      if (state.failNextSetDoc) {
        const error = state.failNextSetDoc
        state.failNextSetDoc = null
        throw error
      }
      if (collection !== 'users') throw firebaseError('permission-denied')
      state.profiles.set(id, structuredClone(data))
    },
    serverTimestamp: () => 'server-timestamp',
  }

  const servicesModule = { auth: state.auth, db: {} }

  function seedAccount(account, { password = TEST_PASSWORD, profile = profileOf(account) } = {}) {
    state.accounts.set(account.email.toLowerCase(), {
      uid: account.uid,
      email: account.email,
      password,
      displayName: account.name ?? null,
    })
    if (profile) state.profiles.set(account.uid, structuredClone(profile))
  }

  // Firebase restores a persisted session before the app mounts; this puts the fake in that state.
  function restoreSession(account) {
    const stored = accountByUid(account.uid) ?? account
    state.auth.currentUser = makeUser(stored)
  }

  function reset() {
    state.accounts.clear()
    state.profiles.clear()
    state.listeners.clear()
    state.auth.currentUser = null
    state.failNextSetDoc = null
    state.nextUid = 1
    resetCalls()
  }

  function snapshot() {
    return {
      accounts: structuredClone([...state.accounts.values()]),
      profiles: structuredClone(Object.fromEntries(state.profiles)),
    }
  }

  resetCalls()
  return { state, authModule, firestoreModule, servicesModule, seedAccount, restoreSession, reset, snapshot }
}

export const fake = createFirebaseFake()
export const { authModule, firestoreModule, servicesModule } = fake
