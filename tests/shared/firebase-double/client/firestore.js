// Browser replacement for `firebase/firestore` in the E2E build (aliased by vite.e2e.config.js).
// Only the users/{uid} document operations AuthContext.jsx uses; everything else is denied, as
// firestore.rules denies the browser access to every other collection.

import { currentIdToken } from './auth.js'

const API_ORIGIN = import.meta.env.VITE_API_URL

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
}

export function getFirestore() {
  return {}
}

export function doc(_db, collection, id) {
  return { collection, id }
}

export function serverTimestamp() {
  return { __serverTimestamp: true }
}

async function call(method, ref, body) {
  if (ref.collection !== 'users') throw permissionDenied()
  const headers = { 'Content-Type': 'application/json' }
  const token = currentIdToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API_ORIGIN}/__double__/firestore/users/${ref.id}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw permissionDenied()
  return response.status === 204 ? null : response.json()
}

export async function getDoc(ref) {
  const { exists, data } = await call('GET', ref)
  return { id: ref.id, exists: () => exists, data: () => (exists ? data : undefined) }
}

export async function setDoc(ref, data) {
  await call('PUT', ref, data)
}
