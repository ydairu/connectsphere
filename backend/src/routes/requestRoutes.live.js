// SPM-42 API tests — live harness. Same cases as requestRoutes.test.js, but nothing is mocked: each seeded
// account signs in through Firebase Authentication for a real ID token, and the app uses the real
// authenticate middleware and the real Firestore project in the root .env.
//
// Writes to the REAL project: tests that succeed in editing a seeded request restore the seeded value
// before finishing. Only seeded requests are touched. Re-run the seed script to reset after an
// interrupted run.
//
// Opt-in, and deliberately not named *.test.js so `npm test` never reaches a real project:
//   LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> node --test backend/src/routes/requestRoutes.live.js
// Needs VITE_FIREBASE_API_KEY and SEED_ACCOUNT_PASSWORD in the root .env, and the seed applied.

import { after, before, describe } from 'node:test'

import { SEED_ACCOUNTS } from '../../scripts/seedData.js'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { registerRequestApiCases } from './requestRoutes.cases.js'

const apiKey = process.env.VITE_FIREBASE_API_KEY
const password = process.env.SEED_ACCOUNT_PASSWORD

function skipReason() {
  if (process.env.LIVE_API_PROJECT !== env.firebaseProjectId) {
    return `set LIVE_API_PROJECT=${env.firebaseProjectId ?? '<FIREBASE_PROJECT_ID>'} to run against the real project`
  }
  if (!apiKey) return 'VITE_FIREBASE_API_KEY is not set'
  if (!password) return 'SEED_ACCOUNT_PASSWORD is not set'
  return null
}

const skip = skipReason()
const tokens = new Map()

async function signIn(accountKey) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_ACCOUNTS[accountKey].email, password, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Sign-in failed for ${SEED_ACCOUNTS[accountKey].email}: ${body.error?.message}`)
  return body.idToken
}

let server
let baseUrl

// node:test treats `skip: null` as skipped, so pass false. A skipped suite registers no cases, otherwise
// node reports each one as cancelled.
describe(`SPM-42 API — live against Firebase project ${env.firebaseProjectId}`, { skip: skip ?? false }, () => {
  if (skip) return

  before(async () => {
    const app = createApp()
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(() => new Promise((resolve) => server.close(resolve)))

  registerRequestApiCases({
    baseUrl: () => baseUrl,
    async tokenFor(accountKey) {
      if (!tokens.has(accountKey)) tokens.set(accountKey, await signIn(accountKey))
      return tokens.get(accountKey)
    },
  })
})
