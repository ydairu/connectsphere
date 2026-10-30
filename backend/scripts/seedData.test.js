// SPM-8 / SPM-68 — proves, offline, that the seed demonstrates Coordinator workloads and the Event Coordinator
// Lead's unassigned queue. Since SPM-68 a submission is not assigned automatically: the Lead chooses, seeing each
// Coordinator's active workload. The SPM-42 / SPM-24 seed checks are in tests/spm-42/unit/seedData.test.js.
// Run: node --test "backend/scripts/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { COORDINATOR, COORDINATOR_LEAD } from '../../shared/permissions.js'
import { DRAFT, SUBMITTED } from '../../shared/status.js'
import { awaitingCoordinatorAssignment, countActiveAssignments } from '../../shared/coordinatorAssignment.js'
import { assignmentCandidates } from '../../shared/coordinatorLeadAssignment.js'
import { createDraftEventRequest, submitDraftEventRequest } from '../src/services/eventRequestService.js'
import { createFakeFirestore } from '../src/testing/fakeFirestore.js'
import { SEED_ACCOUNTS, SEED_REQUESTS } from './seedData.js'

const accounts = Object.values(SEED_ACCOUNTS)

describe('Seed data — Coordinator workloads and the SPM-68 unassigned queue', () => {
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

  test('Every non-draft request has one seeded coordinator except the one unassigned request; drafts carry no assignment', () => {
    for (const request of SEED_REQUESTS) {
      if (request.status === DRAFT) assert.equal(Object.hasOwn(request, 'assignedCoordinatorUid'), false, request.id)
      else if (request.id === 'seed-req-a2-unassigned') assert.equal(request.assignedCoordinatorUid, null)
      else assert.ok(coordinatorUids.includes(request.assignedCoordinatorUid), request.id)
    }
  })

  test('SPM-68: the seed holds one Lead-only account and exactly one request in the unassigned queue', () => {
    const leads = accounts.filter((a) => a.roles.includes(COORDINATOR_LEAD))
    assert.deepEqual(leads.map((a) => [a.uid, a.email, a.roles]), [['seed-coordinator-lead', 'coordinator-lead@seed.connectsphere.test', [COORDINATOR_LEAD]]])
    assert.deepEqual(SEED_REQUESTS.filter(awaitingCoordinatorAssignment).map((r) => r.id), ['seed-req-a2-unassigned'])
  })

  test('SPM-68: the Lead is offered every Coordinator with the seeded workloads, none pre-selected', () => {
    const unassigned = SEED_REQUESTS.find((r) => r.id === 'seed-req-a2-unassigned')
    const coordinators = accounts.filter((a) => a.roles.includes(COORDINATOR)).map(({ uid, name }) => ({ uid, name }))
    const offered = assignmentCandidates(coordinators, unassigned, SEED_ACCOUNTS.coordinatorLead, countActiveAssignments(SEED_REQUESTS))
    assert.deepEqual(offered.map((c) => [c.uid, c.activeEvents]), [
      ['seed-coordinator', 6],
      ['seed-coordinator-2', 2],
      ['seed-coordinator-3', 1],
    ])
  })

  // In-memory database loaded with the seed, through the real submit service. Not the emulator, and not
  // the deployed project.
  test('SPM-68: an organiser submitting a new request on the seeded data is left unassigned, in the queue', async () => {
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
    assert.equal(submitted.assignedCoordinatorUid, null)
    assert.ok(awaitingCoordinatorAssignment(db.store.get(draft.id)))
    assert.equal(db.collectionData(`eventRequests/${draft.id}/activity`).size, 1, 'only the status_changed entry')
  })
})
