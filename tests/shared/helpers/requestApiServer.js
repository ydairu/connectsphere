// Serves the real Express app over HTTP for the SPM-42 and SPM-24 API suites, in two environments:
//
//   startInMemoryApi()  real routes, middleware and shared/permissions.js; Firebase token verification
//                       and persistence replaced by in-memory equivalents. Not database verification.
//   startLiveApi()      nothing mocked: real Firebase Auth sign-ins and the real Firestore project in
//                       the root .env. Opt-in, and skipped unless LIVE_API_PROJECT names that project.
//
// Both return { baseUrl, tokenFor, close } so one set of cases can run against either.

import { createApp } from '../../../backend/src/app.js'
import { env } from '../../../backend/src/config/env.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createMemoryEventRequestStore } from '../../../backend/src/testing/memoryEventRequestStore.js'
import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'

const TOKEN_PREFIX = 'test-token:'

async function listen(app) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

/**
 * @param {object} [options]
 * @param {object[]} [options.extraAccounts]  profiles beyond the seeded ones
 * @param {object[]} [options.extraRequests]  requests beyond the seeded ones
 */
export async function startInMemoryApi({ extraAccounts = [], extraRequests = [] } = {}) {
  const profiles = new Map([...Object.values(SEED_ACCOUNTS), ...extraAccounts].map((account) => [account.uid, account]))

  const authenticate = createAuthenticate({
    async verifyIdToken(token) {
      if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
      return { uid: token.slice(TOKEN_PREFIX.length) }
    },
    async loadProfile(uid) {
      return profiles.get(uid) ?? null
    },
  })

  const app = createApp({
    authenticate,
    eventRequestStore: createMemoryEventRequestStore([...SEED_REQUESTS, ...extraRequests]),
  })
  const { server, baseUrl } = await listen(app)

  return {
    baseUrl: () => baseUrl,
    tokenFor: async (accountKey) => `${TOKEN_PREFIX}${SEED_ACCOUNTS[accountKey].uid}`,
    tokenForUid: (uid) => `${TOKEN_PREFIX}${uid}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

const apiKey = process.env.VITE_FIREBASE_API_KEY
const password = process.env.SEED_ACCOUNT_PASSWORD

/** Why the live suite is skipped, or null when it can run. */
export function liveSkipReason() {
  if (process.env.LIVE_API_PROJECT !== env.firebaseProjectId) {
    return `set LIVE_API_PROJECT=${env.firebaseProjectId ?? '<FIREBASE_PROJECT_ID>'} to run against the real project`
  }
  if (!apiKey) return 'VITE_FIREBASE_API_KEY is not set'
  if (!password) return 'SEED_ACCOUNT_PASSWORD is not set'
  return null
}

export async function startLiveApi() {
  const { server, baseUrl } = await listen(createApp())
  const tokens = new Map()

  return {
    baseUrl: () => baseUrl,
    async tokenFor(accountKey) {
      if (!tokens.has(accountKey)) {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: SEED_ACCOUNTS[accountKey].email, password, returnSecureToken: true }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(`Sign-in failed for ${SEED_ACCOUNTS[accountKey].email}: ${body.error?.message}`)
        tokens.set(accountKey, body.idToken)
      }
      return tokens.get(accountKey)
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** Shared request helper: returns the status, the raw text and the parsed body. */
export function apiClient(harness) {
  async function call(method, path, accountKey, body) {
    const headers = {}
    if (accountKey) headers.Authorization = `Bearer ${await harness.tokenFor(accountKey)}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${harness.baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, text, json: text ? JSON.parse(text) : null }
  }

  return {
    call,
    get: (accountKey, id) => call('GET', `/api/requests/${id}`, accountKey),
    list: (accountKey) => call('GET', '/api/requests', accountKey),
    patch: (accountKey, id, body) => call('PATCH', `/api/requests/${id}`, accountKey, body),
  }
}
