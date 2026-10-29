// SPM-68 API harness — in-memory. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js and shared/coordinatorLeadAssignment.js. Mocked: Firebase token verification (a test
// token names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests and
// profiles). This is not database verification and does not exercise concurrent transaction retries.

import { afterAll, beforeAll, beforeEach } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'

export const UNASSIGNED_ID = 'seed-req-a2-unassigned'

/**
 * Registers the server lifecycle hooks and returns helpers. `extraRequests` and `extraUsers` are added to the
 * seed for every test, keyed by id.
 */
export function useApiHarness({ extraRequests = {}, extraUsers = {} } = {}) {
  const harness = { db: null }
  let server
  let baseUrl

  beforeAll(async () => {
    const authenticate = createAuthenticate({
      async verifyIdToken(token) {
        if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
        return { uid: token.slice(TOKEN_PREFIX.length) }
      },
      async loadProfile(uid) {
        return harness.db.collectionData('users').get(uid) ?? null
      },
    })
    const app = createApp({
      authenticate,
      eventRequestStore: createFakeFirestoreEventRequestStore(() => harness.db),
      getEventRequestDb: () => harness.db,
    })
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  beforeEach(() => {
    harness.db = createFakeFirestore({
      eventRequests: {
        ...Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
        ...structuredClone(extraRequests),
      },
      users: {
        ...Object.fromEntries(Object.values(SEED_ACCOUNTS).map(({ uid, ...profile }) => [uid, profile])),
        ...structuredClone(extraUsers),
      },
    })
  })

  async function call(method, path, account, body) {
    const headers = account ? { Authorization: `Bearer ${TOKEN_PREFIX}${account.uid}` } : {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  }

  return Object.assign(harness, {
    call,
    queue: (account) => call('GET', '/api/requests/unassigned', account),
    candidates: (account, id) => call('GET', `/api/event-requests/${id}/assignment/candidates`, account),
    assign: (account, id, body) => call('POST', `/api/event-requests/${id}/assignment`, account, body),
    view: (account, id) => call('GET', `/api/requests/${id}`, account),
    list: (account) => call('GET', '/api/requests', account),
    transition: (account, id, action, reason) => call('POST', `/api/event-requests/${id}/transitions`, account, { action, ...(reason ? { reason } : {}) }),
    stored: (id) => structuredClone(harness.db.store.get(id)),
    activity: (id) => [...harness.db.collectionData(`eventRequests/${id}/activity`).values()],
  })
}
