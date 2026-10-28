// SPM-8 — proves, offline, that the seed demonstrates workload-based Coordinator assignment. The
// SPM-42 / SPM-24 seed checks are in tests/spm-42/unit/seedData.test.js.
// Run: node --test "backend/scripts/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { COORDINATOR } from '../../shared/permissions.js'
import { DRAFT, SUBMITTED } from '../../shared/status.js'
import { countActiveAssignments, selectCoordinator } from '../../shared/coordinatorAssignment.js'
import { createDraftEventRequest, submitDraftEventRequest } from '../src/services/eventRequestService.js'
import { createFakeFirestore } from '../src/testing/fakeFirestore.js'
import { SEED_ACCOUNTS, SEED_REQUESTS } from './seedData.js'

const accounts = Object.values(SEED_ACCOUNTS)

describe('Seed data — SPM-8 coordinator workload demonstration', () => {
  const coordinatorUids = accounts.filter((a) => a.roles.includes(COORDINATOR)).map((a) => a.uid)

  test('Seed holds three coordinators', () => {
    assert.deepEqual(coordinatorUids.sort(), ['seed-coordinator', 'seed-coordinator-2', 'seed-coordinator-3'])
  })

  // Walkthrough fix B added a past Confirmed event for Seed Coordinator (was 4); SPM-19 added the two-place
  // Confirmed event (was 5).
  test('Seeded active workloads are 6, 2 and 1', () => {
    const counts = countActiveAssignments(SEED_REQUESTS)
    assert.equal(counts.get('seed-coordinator'), 6)
    assert.equal(counts.get('seed-coordinator-2'), 2)
    assert.equal(counts.get('seed-coordinator-3'), 1)
  })

  test('Every non-draft request has one seeded coordinator; drafts carry no assignment', () => {
    for (const request of SEED_REQUESTS) {
      if (request.status === DRAFT) assert.equal(Object.hasOwn(request, 'assignedCoordinatorUid'), false, request.id)
      else assert.ok(coordinatorUids.includes(request.assignedCoordinatorUid), request.id)
    }
  })

  test('Selection on the seed picks coordinator-3 whatever the tie-break', () => {
    const activeCounts = countActiveAssignments(SEED_REQUESTS)
    for (const value of [0, 0.5, 0.999]) {
      assert.equal(selectCoordinator({ coordinatorUids, activeCounts, random: () => value }), 'seed-coordinator-3')
    }
  })

  // In-memory database loaded with the seed, through the real submit service. Not the emulator, and not
  // the deployed project.
  test('An organiser submitting a new request on the seeded data gets coordinator-3', async () => {
    const users = Object.fromEntries(accounts.map(({ uid, ...profile }) => [uid, profile]))
    const eventRequests = Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request]))
    const db = createFakeFirestore({ users, eventRequests })

    const draft = await createDraftEventRequest(
      {
        core: { title: 'Seed demo', purpose: 'SPM-8', expectedAttendees: 40, durationHours: 3, preferredDateTime: '2027-02-12T18:30:00+08:00' },
        venue: { layoutPreference: 'theatre' },
      },
      SEED_ACCOUNTS.organiserA3,
      db,
    )
    const submitted = await submitDraftEventRequest(draft.id, SEED_ACCOUNTS.organiserA3, db)

    assert.equal(submitted.status, SUBMITTED)
    assert.equal(submitted.assignedCoordinatorUid, 'seed-coordinator-3')
  })
})
