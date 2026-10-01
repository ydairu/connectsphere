// Proves, offline, that the seed can demonstrate what it exists to demonstrate. Each check runs the seed
// through shared/permissions.js rather than just counting rows.
// Run: node --test "backend/scripts/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CORE,
  EQUIPMENT,
  ORGANISER,
  ROLES,
  TECHNICAL_STAFF,
  VENUE,
  VENUE_STAFF,
  canEdit,
  inScope,
  projectRequest,
} from '../../shared/permissions.js'
import { DRAFT, STATUSES, SUBMITTED } from '../../shared/status.js'
import { COORDINATOR } from '../../shared/permissions.js'
import { countActiveAssignments, selectCoordinator } from '../../shared/coordinatorAssignment.js'
import { createDraftEventRequest, submitDraftEventRequest } from '../src/services/eventRequestService.js'
import { createFakeFirestore } from '../src/testing/fakeFirestore.js'
import { SEED_ACCOUNTS, SEED_ID_PREFIX, SEED_REQUESTS, SEED_TAG } from './seedData.js'

const accounts = Object.values(SEED_ACCOUNTS)
const byId = Object.fromEntries(SEED_REQUESTS.map((r) => [r.id, r]))
const { coordinator, venueStaff, venueTechnicalStaff, attendee, organiserA1, organiserA2, organiserB1 } = SEED_ACCOUNTS

describe('Seed data — SPM-42 / SPM-24 demonstration coverage', () => {
  test('Seed holds an account for each of the five roles', () => {
    for (const role of ROLES) {
      assert.ok(accounts.some((a) => a.roles.length === 1 && a.roles[0] === role), `no single-role ${role} account`)
    }
  })

  test('Seed holds one account with both venue_staff and technical_staff', () => {
    const dual = accounts.filter((a) => a.roles.includes(VENUE_STAFF) && a.roles.includes(TECHNICAL_STAFF))
    assert.equal(dual.length, 1)
  })

  test('Seed holds at least two organisations, one of them with two organisers', () => {
    const organisersByOrg = {}
    for (const a of accounts.filter((a) => a.roles.includes(ORGANISER))) {
      assert.ok(a.organisationId, `${a.uid} has no organisationId`)
      organisersByOrg[a.organisationId] = (organisersByOrg[a.organisationId] ?? 0) + 1
    }
    assert.ok(Object.keys(organisersByOrg).length >= 2)
    assert.ok(Object.values(organisersByOrg).some((n) => n >= 2))
  })

  test('Seed holds an event request in every status in shared/status.js', () => {
    const seeded = new Set(SEED_REQUESTS.map((r) => r.status))
    for (const status of STATUSES) assert.ok(seeded.has(status), `no seeded request at ${status}`)
  })

  test('Seed drafts are owned by different organisers', () => {
    const owners = new Set(SEED_REQUESTS.filter((r) => r.status === DRAFT).map((r) => r.ownerUid))
    assert.ok(owners.size >= 2)
  })

  test('Every seeded account and request has a unique ID carrying the seed prefix', () => {
    assert.ok(SEED_TAG)
    for (const { uid } of accounts) assert.ok(uid.startsWith(SEED_ID_PREFIX), uid)
    for (const { id } of SEED_REQUESTS) assert.ok(id.startsWith(SEED_ID_PREFIX), id)
    assert.equal(new Set(SEED_REQUESTS.map((r) => r.id)).size, SEED_REQUESTS.length, 'duplicate request id')
    assert.equal(new Set(accounts.map((a) => a.email)).size, accounts.length, 'duplicate email')
  })

  test('Demonstrable on the seed: same-organisation colleague views but cannot edit a submitted request', () => {
    const request = byId['seed-req-a2-submitted']
    assert.equal(inScope(organiserA1, request), true)
    assert.equal(canEdit(organiserA1, request, CORE), false)
  })

  test("Demonstrable on the seed: a colleague's draft and another organisation's events are out of scope", () => {
    assert.equal(inScope(organiserA1, byId['seed-req-a2-draft']), false)
    assert.equal(inScope(organiserB1, byId['seed-req-a1-submitted']), false)
    assert.equal(inScope(organiserA2, byId['seed-req-b1-planning']), false)
  })

  test('Demonstrable on the seed: coordinator sees every non-draft request and no draft', () => {
    for (const request of SEED_REQUESTS) assert.equal(inScope(coordinator, request), request.status !== DRAFT, request.id)
  })

  test('Demonstrable on the seed: owner edits a returned request but not a submitted one', () => {
    assert.equal(canEdit(organiserA1, byId['seed-req-a1-returned'], CORE), true)
    assert.equal(canEdit(organiserA1, byId['seed-req-a1-submitted'], CORE), false)
  })

  test('Demonstrable on the seed: venue+technical account edits venue and equipment where venue-only staff cannot', () => {
    const planning = byId['seed-req-b1-planning']
    assert.equal(canEdit(venueTechnicalStaff, planning, VENUE), true)
    assert.equal(canEdit(venueTechnicalStaff, planning, EQUIPMENT), true)
    assert.equal(inScope(venueStaff, planning), false)
  })

  test('Demonstrable on the seed: attendee receives a confirmed event without internal fields', () => {
    const body = projectRequest(attendee, byId['seed-req-a1-confirmed'])
    assert.ok(body)
    assert.equal(Object.hasOwn(body, 'internal'), false)
  })
})

describe('Seed data — SPM-8 coordinator workload demonstration', () => {
  const coordinatorUids = accounts.filter((a) => a.roles.includes(COORDINATOR)).map((a) => a.uid)

  test('Seed holds three coordinators', () => {
    assert.deepEqual(coordinatorUids.sort(), ['seed-coordinator', 'seed-coordinator-2', 'seed-coordinator-3'])
  })

  test('Seeded active workloads are 4, 2 and 1', () => {
    const counts = countActiveAssignments(SEED_REQUESTS)
    assert.equal(counts.get('seed-coordinator'), 4)
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
