// SPM-16 AC6 — simultaneous conflicting hold requests against the REAL Firestore project: exactly one
// secures the period and the others create nothing. The in-memory double cannot show this, because it
// never retries a transaction (see tentativeHoldConflicts.test.js).
//
// Writes to the REAL project: a throwaway venue tagged LIVE_TEST_TAG, the holds it receives and its lock
// document. All three are deleted in afterAll, whether or not the assertions pass. Seeded data is not
// touched.
//
// Skipped unless opted in, so CI never reaches a real project:
//   LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { env } from '../../../backend/src/config/env.js'
import { getAdminDb } from '../../../backend/src/config/firebaseAdmin.js'
import { createTentativeVenueHold, VenueConflictError, venueBookingLockPath } from '../../../backend/src/services/venueService.js'

const LIVE_TEST_TAG = 'spm16-live-concurrency'
const REQUESTS = 5
const skip = process.env.LIVE_API_PROJECT !== env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey

describe.skipIf(skip)('SPM-16 tentative holds — simultaneous requests against the real Firebase project', () => {
  const venueId = `${LIVE_TEST_TAG}-${randomUUID()}`
  const actor = { uid: LIVE_TEST_TAG, name: 'SPM-16 live test' }

  afterAll(async () => {
    const db = getAdminDb()
    const holds = await db.collection('venueAvailability').where('venueId', '==', venueId).get()
    const [lockCollection, lockId] = venueBookingLockPath(venueId)
    const batch = db.batch()
    for (const doc of holds.docs) batch.delete(doc.ref)
    batch.delete(db.collection('venues').doc(venueId))
    batch.delete(db.collection(lockCollection).doc(lockId))
    await batch.commit()

    const [left, venue, lock] = await Promise.all([
      db.collection('venueAvailability').where('venueId', '==', venueId).get(),
      db.collection('venues').doc(venueId).get(),
      db.collection(lockCollection).doc(lockId).get(),
    ])
    console.log(`[spm16 live] cleanup: ${holds.size} hold(s) deleted; left behind: holds=${left.size} venue=${venue.exists} lock=${lock.exists}`)
  })

  it('spm16_live_only_one_of_several_simultaneous_conflicting_holds_is_created (AC6)', async () => {
    const db = getAdminDb()
    await db.collection('venues').doc(venueId).set({
      name: 'SPM-16 live concurrency venue (throwaway)',
      location: 'Test',
      maximumCapacity: 10,
      facilities: ['None'],
      accessibilityFeatures: ['None'],
      supportedLayouts: ['Theatre'],
      operatingHours: 'Test',
      setupMinutes: 30,
      turnaroundMinutes: 45,
      liveTestTag: LIVE_TEST_TAG,
      createdAt: new Date().toISOString(),
    })

    // Staggered by 15 minutes: every pair overlaps on its occupied period.
    const base = Date.parse('2027-03-01T02:00:00.000Z')
    const quarter = 15 * 60 * 1000
    const results = await Promise.allSettled(
      Array.from({ length: REQUESTS }, (_, index) =>
        createTentativeVenueHold(
          {
            venueId,
            startsAt: new Date(base + index * quarter).toISOString(),
            endsAt: new Date(base + index * quarter + 2 * 60 * 60 * 1000).toISOString(),
            eventRequestId: `${LIVE_TEST_TAG}-request-${index}`,
            title: `Live request ${index}`,
          },
          actor,
          db,
        ),
      ),
    )

    const created = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    const conflicts = rejected.filter((result) => result.reason instanceof VenueConflictError)
    const otherErrors = rejected.filter((result) => !(result.reason instanceof VenueConflictError))
    const stored = await db.collection('venueAvailability').where('venueId', '==', venueId).get()
    console.log(
      `[spm16 live] ${REQUESTS} simultaneous requests: created=${created.length} conflict=${conflicts.length} other=${otherErrors.length}` +
        `${otherErrors.map((result) => ` (${result.reason?.code ?? ''} ${result.reason?.message})`).join('')}; stored holds=${stored.size}`,
    )

    expect(created).toHaveLength(1)
    expect(conflicts).toHaveLength(REQUESTS - 1)
    expect(stored.size).toBe(1)
    expect(stored.docs[0].id).toBe(created[0].value.id)
  }, 60000)
})
