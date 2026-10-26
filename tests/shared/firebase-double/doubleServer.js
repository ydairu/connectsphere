// In-memory Firebase double for the Playwright suites, serving:
//   /__double__/...   the Firebase Auth + Firestore behaviour the browser app depends on
//   /api/...          the REAL Express application (createApp) with token verification and profile
//                     loading pointed at the double. Every route, /api/event-requests included, reads
//                     and writes one in-memory database (fakeFirestore) that also holds the profiles.
//
// Not Firebase: error codes and flows mirror what the application relies on, nothing more. Security
// rules are not evaluated here (see tests/spm-2/integration/firestoreRules.static.test.js).

import cors from 'cors'
import express from 'express'
import { SEED_ACCOUNTS, SEED_FIELD_HISTORY, SEED_REQUESTS, SEED_VENUES, SEED_VENUE_AVAILABILITY } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { processVenueHolds } from '../../../backend/src/services/venueHoldExpiryService.js'
import { ALL_TEST_USERS, TEST_PASSWORD, profileOf } from '../fixtures/testUsers.js'
import { createFakeFirestoreEventRequestStore } from './fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function createDouble() {
  // users/{uid} profiles live in the database too, so SPM-8's coordinator selection on submit sees them.
  // reset() replaces the whole database: seeded requests and their seeded field history (SPM-28), no other
  // activity entries, no assignment lock.
  const state = { accounts: new Map(), db: null, profiles: null, approvedSafetyEvents: new Set(), nextUid: 1 }

  function reset() {
    state.accounts.clear()
    state.approvedSafetyEvents.clear()
    state.db = createFakeFirestore({
      eventRequests: Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
      venues: Object.fromEntries(SEED_VENUES.map(({ id, ...venue }) => [id, venue])),
      venueAvailability: Object.fromEntries(SEED_VENUE_AVAILABILITY.map(({ id, ...entry }) => [id, entry])),
      // SPM-28: the seeded field history, in each request's activity subcollection.
      ...Object.fromEntries(
        Object.entries(SEED_FIELD_HISTORY).map(([requestId, entries]) => [
          `eventRequests/${requestId}/activity`,
          Object.fromEntries(entries.map(({ id, ...entry }) => [id, entry])),
        ]),
      ),
    })
    state.profiles = state.db.collectionData('users')
    state.nextUid = 1
    for (const account of ALL_TEST_USERS) addAccount(account)
  }

  function addAccount(account) {
    state.accounts.set(account.email.toLowerCase(), {
      uid: account.uid,
      email: account.email,
      password: TEST_PASSWORD,
      displayName: account.name,
    })
    state.profiles.set(account.uid, { ...profileOf(account), createdAt: new Date(0).toISOString() })
  }

  const accountByUid = (uid) => [...state.accounts.values()].find((account) => account.uid === uid)
  const publicUser = ({ uid, email, displayName }) => ({ uid, email, displayName })
  const tokenFor = (uid) => `${TOKEN_PREFIX}${uid}`
  const fail = (res, status, code) => res.status(status).json({ code })

  function uidFromRequest(req) {
    const header = req.get('authorization') ?? ''
    if (!header.startsWith('Bearer ')) return null
    const token = header.slice(7).trim()
    if (!token.startsWith(TOKEN_PREFIX)) return null
    const uid = token.slice(TOKEN_PREFIX.length)
    return accountByUid(uid) ? uid : null
  }

  // Mirrors signedInAs(uid) in firestore.rules: a user may only touch their own records.
  function requireSelf(req, res, next) {
    const uid = uidFromRequest(req)
    if (!uid) return fail(res, 401, 'unauthenticated')
    if (uid !== req.params.uid) return fail(res, 403, 'permission-denied')
    return next()
  }

  function replaceSentinels(value) {
    if (Array.isArray(value)) return value.map(replaceSentinels)
    if (value && typeof value === 'object') {
      if (value.__serverTimestamp) return new Date().toISOString()
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, replaceSentinels(inner)]))
    }
    return value
  }

  const router = express.Router()

  router.get('/health', (_req, res) => res.json({ status: 'ok' }))
  router.post('/reset', (_req, res) => {
    reset()
    res.status(204).end()
  })
  // Test-only SPM-91/92 stand-in. No production request can set this; the real verifier remains fail-closed.
  router.post('/safety-approvals/:id', (req, res) => {
    if (!state.db.collectionData('eventRequests').has(req.params.id)) return res.status(404).json({ message: 'Event not found' })
    state.approvedSafetyEvents.add(req.params.id)
    return res.status(204).end()
  })
  // Signs in one more seeded account (SEED_ACCOUNTS key) until the next reset, for a spec that needs an
  // account outside ALL_TEST_USERS without changing every other spec's users — e.g. SPM-48 needs the
  // Coordinator of A1's confirmed event, and a permanent extra Coordinator would change SPM-26's choices.
  router.post('/accounts/:key', (req, res) => {
    const account = SEED_ACCOUNTS[req.params.key]
    if (!account) return res.status(404).json({ message: `No seeded account ${req.params.key}` })
    addAccount(account)
    return res.status(204).end()
  })
  router.get('/state', (_req, res) => {
    res.json({
      accounts: [...state.accounts.values()].map(publicUser),
      profiles: Object.fromEntries(state.profiles),
    })
  })
  // Test-only venue snapshots expose persisted audit entries without adding a product history API.
  // Fixture replacement is limited to venue collections and is cleared by the usual per-test reset.
  router.post('/venue-fixtures', (req, res) => {
    for (const path of ['venues', 'venueAvailability']) {
      if (!req.body?.[path]) continue
      const collection = state.db.collectionData(path)
      collection.clear()
      for (const [id, record] of Object.entries(req.body[path])) collection.set(id, structuredClone(record))
    }
    res.status(204).end()
  })
  router.get('/venue-state', (_req, res) => {
    const venues = Object.fromEntries(state.db.collectionData('venues'))
    res.json({
      venues,
      availability: Object.fromEntries(state.db.collectionData('venueAvailability')),
      history: Object.fromEntries(Object.keys(venues).map((id) => [
        id, Object.fromEntries(state.db.collectionData(`venues/${id}/activity`)),
      ])),
    })
  })
  // Test-only clock control for SPM-78. This route is never mounted by the product API.
  router.post('/venue-hold-expiry', (req, res) => {
    const booking = state.db.collectionData('venueBookingRequests').get(req.body?.bookingId)
    const deadline = req.body?.holdExpiresAt
    if (!booking || !Number.isFinite(Date.parse(deadline))) return res.status(400).json({ message: 'Valid booking and deadline required.' })
    const hold = state.db.collectionData('venueAvailability').get(booking.holdId)
    if (!hold) return res.status(404).json({ message: 'Hold not found.' })
    booking.holdExpiresAt = deadline
    hold.holdExpiresAt = deadline
    return res.status(204).end()
  })
  router.post('/process-venue-holds', async (req, res, next) => {
    try {
      const now = req.body?.now ? new Date(req.body.now) : new Date()
      if (!Number.isFinite(now.getTime())) return res.status(400).json({ message: 'Invalid time.' })
      return res.json(await processVenueHolds(state.db, now))
    } catch (error) { return next(error) }
  })

  router.post('/auth/signUp', (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) return fail(res, 400, 'auth/invalid-email')
    if (!password) return fail(res, 400, 'auth/missing-password')
    if (password.length < 6) return fail(res, 400, 'auth/weak-password')
    if (state.accounts.has(email.toLowerCase())) return fail(res, 400, 'auth/email-already-in-use')
    const account = { uid: `e2e-uid-${state.nextUid++}`, email, password, displayName: null }
    state.accounts.set(email.toLowerCase(), account)
    return res.status(201).json({ user: publicUser(account), idToken: tokenFor(account.uid) })
  })

  router.post('/auth/signInWithPassword', (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) return fail(res, 400, 'auth/invalid-email')
    if (!password) return fail(res, 400, 'auth/missing-password')
    const account = state.accounts.get(email.toLowerCase())
    if (!account || account.password !== password) return fail(res, 400, 'auth/invalid-credential')
    return res.json({ user: publicUser(account), idToken: tokenFor(account.uid) })
  })

  router.patch('/auth/users/:uid', requireSelf, (req, res) => {
    const account = accountByUid(req.params.uid)
    if (typeof req.body?.displayName === 'string') account.displayName = req.body.displayName
    res.json({ user: publicUser(account) })
  })

  router.delete('/auth/users/:uid', requireSelf, (req, res) => {
    const account = accountByUid(req.params.uid)
    state.accounts.delete(account.email.toLowerCase())
    res.status(204).end()
  })

  router.get('/firestore/users/:uid', requireSelf, (req, res) => {
    const data = state.profiles.get(req.params.uid)
    res.json({ exists: data !== undefined, data: data ?? null })
  })

  router.put('/firestore/users/:uid', requireSelf, (req, res) => {
    state.profiles.set(req.params.uid, replaceSentinels(req.body ?? {}))
    res.status(204).end()
  })

  const authenticate = createAuthenticate({
    async verifyIdToken(token) {
      if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid test token')
      const account = accountByUid(token.slice(TOKEN_PREFIX.length))
      if (!account) throw new Error('Token belongs to a deleted account')
      return { uid: account.uid, email: account.email }
    },
    async loadProfile(uid) {
      return state.profiles.get(uid) ?? null
    },
  })

  const api = createApp({
    authenticate,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => state.db),
    getEventRequestDb: () => state.db,
    getVenueDb: () => state.db,
    // SPM-37: equipment types and units start empty after every reset.
    getEquipmentDb: () => state.db,
    verifySafetyApproval: async (request) => state.approvedSafetyEvents.has(request.id),
  })

  reset()
  return { state, router, api, reset }
}

export function startDoubleServer({ port, clientOrigin }) {
  const double = createDouble()
  const server = express()
  server.use('/__double__', cors({ origin: clientOrigin }), express.json(), double.router)
  server.use(double.api)
  return server.listen(port, '127.0.0.1', () => {
    console.log(`Firebase double + API listening on http://127.0.0.1:${port} for ${clientOrigin}`)
  })
}
