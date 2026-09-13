import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { env } from './env.js'

function getFirebaseApp() {
  if (getApps().length) return getApps()[0]

  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new Error('Firebase Admin environment variables are not configured.')
  }

  return initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  })
}

export function getAdminAuth() {
  return getAuth(getFirebaseApp())
}

export function getAdminDb() {
  return getFirestore(getFirebaseApp())
}

