// Shared harness for the SPM-47 and SPM-63 API suites. Real HTTP against the real Express app, the
// authenticate middleware and the shared rule modules. Mocked: Firebase token verification (a test token
// names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests and
// profiles). This is not database verification.
//
// The seeded Confirmed event (seed-req-a1-confirmed) is moved to start 30 days after the real current time,
// because the API uses the real clock and cancellation is allowed only before the start date/time.

import { SEED_ACCOUNTS, SEED_EQUIPMENT_REQUESTS, SEED_EQUIPMENT_RESERVATIONS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { NOTIFICATIONS_COLLECTION } from '../../../shared/notifications.js'
import { createFakeFirestoreEventRequestStore } from '../firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const DAY = 24 * 60 * 60 * 1000

export const CONFIRMED_ID = 'seed-req-a1-confirmed'

export function createCancellationApi({ verifySafetyApproval = async () => false, includeReservations = false } = {}) {
  let db
  let server
  let baseUrl

  async function start() {
    const authenticate = createAuthenticate({
      async verifyIdToken(token) {
        if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
        return { uid: token.slice(TOKEN_PREFIX.length) }
      },
      async loadProfile(uid) {
        return db.collectionData('users').get(uid) ?? null
      },
    })
    const app = createApp({
      authenticate,
      eventRequestStore: createFakeFirestoreEventRequestStore(() => db),
      getEventRequestDb: () => db,
      verifySafetyApproval,
    })
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  }

  const stop = () => new Promise((resolve) => server.close(resolve))

  function reset() {
    db = createFakeFirestore({
      eventRequests: Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
      ...(includeReservations ? {
        equipmentRequests: Object.fromEntries(SEED_EQUIPMENT_REQUESTS.map(({ id, ...request }) => [id, request])),
        equipmentReservations: Object.fromEntries(SEED_EQUIPMENT_RESERVATIONS.map(({ id, ...reservation }) => [id, reservation])),
      } : {}),
      users: Object.fromEntries(Object.values(SEED_ACCOUNTS).map(({ uid, ...profile }) => [uid, profile])),
    })
    setStart(CONFIRMED_ID, new Date(Date.now() + 30 * DAY))
  }

  /** Moves an event's start date/time, e.g. into the past to test the cut-off. */
  function setStart(id, date) {
    const request = db.store.get(id)
    db.store.set(id, { ...request, core: { ...request.core, preferredDateTime: date.toISOString() } })
  }

  async function call(method, path, account, body) {
    const headers = {}
    if (account) headers.Authorization = `Bearer ${TOKEN_PREFIX}${account.uid}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  }

  const act = (account, action, reason, id = CONFIRMED_ID) =>
    call('POST', `/api/event-requests/${id}/transitions`, account, reason === undefined ? { action } : { action, reason })
  const view = (account, id = CONFIRMED_ID) => call('GET', `/api/requests/${id}`, account)
  const list = async (account) => (await call('GET', '/api/requests', account)).json.requests
  const notificationsOf = async (account) => (await call('GET', '/api/notifications', account)).json.notifications
  const stored = (id = CONFIRMED_ID) => db.store.get(id)
  const activity = (id = CONFIRMED_ID) => [...db.collectionData(`eventRequests/${id}/activity`).values()]
  const allNotifications = () => [...db.collectionData(NOTIFICATIONS_COLLECTION).values()]
  const reservations = () => [...db.collectionData('equipmentReservations').values()]
  const transactions = () => db.transactions

  return { start, stop, reset, setStart, call, act, view, list, notificationsOf, stored, activity, allNotifications, reservations, transactions }
}
