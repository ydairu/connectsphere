// Browser replacement for `firebase/auth` in the E2E build (aliased by vite.e2e.config.js).
// Talks to the double server; keeps the session in localStorage the way Firebase persists it, so a
// page reload restores the signed-in user and signOut() ends it.

const SESSION_KEY = 'connectsphere-e2e-session'
const API_ORIGIN = import.meta.env.VITE_API_URL

const listeners = new Set()
let session = readSession()
let currentUser = session ? toUser(session) : null

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function toUser(stored) {
  return {
    uid: stored.uid,
    email: stored.email,
    displayName: stored.displayName ?? null,
    getIdToken: async () => stored.idToken,
  }
}

function persist(next) {
  session = next
  if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next))
  else window.localStorage.removeItem(SESSION_KEY)
  currentUser = next ? toUser(next) : null
}

function notify() {
  for (const listener of listeners) listener(currentUser)
}

function authError(code) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code })
}

async function call(method, path, body, { authenticated = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (authenticated && session) headers.Authorization = `Bearer ${session.idToken}`
  const response = await fetch(`${API_ORIGIN}/__double__/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw authError(json.code ?? 'auth/internal-error')
  return json
}

export function currentIdToken() {
  return session?.idToken ?? null
}

const authInstance = {
  get currentUser() {
    return currentUser
  },
}

export function getAuth() {
  return authInstance
}

export function onAuthStateChanged(_auth, listener) {
  listeners.add(listener)
  Promise.resolve().then(() => {
    if (listeners.has(listener)) listener(currentUser)
  })
  return () => listeners.delete(listener)
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const { user, idToken } = await call('POST', 'auth/signInWithPassword', { email, password })
  persist({ ...user, idToken })
  notify()
  return { user: currentUser }
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { user, idToken } = await call('POST', 'auth/signUp', { email, password })
  persist({ ...user, idToken })
  notify()
  return { user: currentUser }
}

export async function updateProfile(user, { displayName }) {
  await call('PATCH', `auth/users/${user.uid}`, { displayName }, { authenticated: true })
  if (session?.uid === user.uid) persist({ ...session, displayName })
}

export async function deleteUser(user) {
  await call('DELETE', `auth/users/${user.uid}`, undefined, { authenticated: true })
  if (session?.uid === user.uid) {
    persist(null)
    notify()
  }
}

export async function signOut() {
  persist(null)
  notify()
}
