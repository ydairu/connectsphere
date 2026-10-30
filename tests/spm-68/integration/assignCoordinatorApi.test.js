// SPM-68 AC4, AC5, AC6 and AC9 through the API: the Lead assigns a Coordinator from the queue
// (POST /api/event-requests/:id/assignment, GET .../assignment/candidates). In-memory harness (apiHarness.js) —
// not database verification, and it does not exercise concurrent transaction retries; the already-assigned
// refusal below is what a second Lead's retried transaction meets.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { ASSIGNMENT_LOCK_PATH, COORDINATOR_ASSIGNED } from '../../../backend/src/services/coordinatorAssignmentService.js'
import {
  NOT_FOUND,
  NOT_PERMITTED,
  NOT_UNASSIGNED,
  TARGET_IS_OWNER,
  TARGET_IS_SELF,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
} from '../../../shared/coordinatorLeadAssignment.js'
import { COORDINATOR, COORDINATOR_LEAD, ORGANISER } from '../../../shared/permissions.js'
import { START_REVIEW } from '../../../shared/statusTransitions.js'
import { DRAFT, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { UNASSIGNED_ID, useApiHarness } from './apiHarness.js'

const LEAD_COORDINATOR = { uid: 'spm68-lead-coordinator', name: 'Lead And Coordinator', roles: [COORDINATOR_LEAD, COORDINATOR] }
const ORGANISER_COORDINATOR = { uid: 'spm68-organiser-coordinator', name: 'Organiser And Coordinator', roles: [ORGANISER, COORDINATOR], organisationId: 'seed-org-a', organisationName: 'Seed Organisation A' }
const OWN_REQUEST_ID = 'spm68-submitted-by-a-coordinator'
const DRAFT_ID = 'spm68-draft'

const api = useApiHarness({
  extraUsers: Object.fromEntries([LEAD_COORDINATOR, ORGANISER_COORDINATOR].map(({ uid, ...profile }) => [uid, profile])),
  extraRequests: {
    [OWN_REQUEST_ID]: { status: SUBMITTED, ownerUid: ORGANISER_COORDINATOR.uid, organisationId: 'seed-org-a', assignedCoordinatorUid: null, core: { title: 'Own request' }, createdAt: '2026-10-01T00:00:00.000Z' },
    [DRAFT_ID]: { status: DRAFT, ownerUid: SEED_ACCOUNTS.organiserA1.uid, assignedCoordinatorUid: null, core: { title: 'Draft' }, createdAt: '2026-10-01T00:00:00.000Z' },
  },
})
const { coordinator, coordinator2, coordinator3, coordinatorLead, organiserA1, organiserA2, venueStaff } = SEED_ACCOUNTS
const NOW_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('SPM-68 AC4 — the Lead selects a Coordinator and confirms', () => {
  it('assigns the request, records who assigned it and when, and returns only the new Coordinator’s name', async () => {
    const response = await api.assign(coordinatorLead, UNASSIGNED_ID, { coordinatorUid: coordinator3.uid })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({ id: UNASSIGNED_ID, assigned: true, coordinator: { name: coordinator3.name } })
    const stored = api.stored(UNASSIGNED_ID)
    expect(stored.assignedCoordinatorUid).toBe(coordinator3.uid)
    expect(stored.assignedByUid).toBe(coordinatorLead.uid)
    expect(stored.assignedAt).toMatch(NOW_PATTERN)
    expect(stored.status).toBe(SUBMITTED)
    expect(api.activity(UNASSIGNED_ID)).toEqual([
      {
        type: COORDINATOR_ASSIGNED,
        coordinatorUid: coordinator3.uid,
        actor: { type: 'user', uid: coordinatorLead.uid, name: coordinatorLead.name },
        at: stored.assignedAt,
      },
    ])
  })

  it('reads and writes the coordinator assignment lock in the same transaction', async () => {
    await api.assign(coordinatorLead, UNASSIGNED_ID, { coordinatorUid: coordinator3.uid })
    const { reads, writes, committed } = api.db.transactions.at(-1)
    const lock = ASSIGNMENT_LOCK_PATH.join('/')
    expect(committed).toBe(true)
    expect(reads).toContain(lock)
    expect(writes).toContain(lock)
    expect(reads).toContain(`eventRequests/${UNASSIGNED_ID}`)
  })

  it('the request leaves the queue and reaches the Coordinator, who can start the review', async () => {
    await api.assign(coordinatorLead, UNASSIGNED_ID, { coordinatorUid: coordinator3.uid })

    expect((await api.queue(coordinatorLead)).json.requests.map((item) => item.id)).not.toContain(UNASSIGNED_ID)
    // SPM-69: the Lead who assigned it keeps it in view (CL3 G8!C41), still with no actions.
    const leadView = await api.view(coordinatorLead, UNASSIGNED_ID)
    expect(leadView.status).toBe(200)
    expect(leadView.json.availableActions).toEqual([])
    expect((await api.list(coordinator3)).json.requests.map((request) => request.id)).toContain(UNASSIGNED_ID)
    const started = await api.transition(coordinator3, UNASSIGNED_ID, START_REVIEW)
    expect(started.status).toBe(200)
    expect(api.stored(UNASSIGNED_ID).status).toBe(UNDER_REVIEW)
  })

  it('the candidate list offers every Coordinator with their active workload', async () => {
    const response = await api.candidates(coordinatorLead, UNASSIGNED_ID)
    expect(response.status).toBe(200)
    // Sorted by name; this file's two extra multi-role accounts also hold the Coordinator role.
    expect(response.json.candidates).toEqual([
      { uid: LEAD_COORDINATOR.uid, name: LEAD_COORDINATOR.name, activeEvents: 0 },
      { uid: ORGANISER_COORDINATOR.uid, name: ORGANISER_COORDINATOR.name, activeEvents: 0 },
      { uid: coordinator.uid, name: coordinator.name, activeEvents: 6 },
      { uid: coordinator2.uid, name: coordinator2.name, activeEvents: 2 },
      { uid: coordinator3.uid, name: coordinator3.name, activeEvents: 1 },
    ])
  })
})

describe('SPM-68 AC4 — refusals leave the request unchanged', () => {
  const unchanged = async (response, status, reason) => {
    expect(response.status).toBe(status)
    expect(response.json.reason).toBe(reason)
  }

  it('already assigned → 409, the first assignment is kept', async () => {
    await api.assign(coordinatorLead, UNASSIGNED_ID, { coordinatorUid: coordinator3.uid })
    const before = api.stored(UNASSIGNED_ID)
    const activityBefore = api.activity(UNASSIGNED_ID)

    await unchanged(await api.assign({ uid: 'spm68-lead-coordinator' }, UNASSIGNED_ID, { coordinatorUid: coordinator2.uid }), 409, NOT_UNASSIGNED)
    expect(api.stored(UNASSIGNED_ID)).toEqual(before)
    expect(api.activity(UNASSIGNED_ID)).toEqual(activityBefore)
  })

  it('an assigned seeded request (assigned before SPM-68) → 409 and keeps its Coordinator (AC7)', async () => {
    await unchanged(await api.assign(coordinatorLead, 'seed-req-a1-submitted', { coordinatorUid: coordinator2.uid }), 409, NOT_UNASSIGNED)
    expect(api.stored('seed-req-a1-submitted').assignedCoordinatorUid).toBe(coordinator.uid)
  })

  it('a request at another status → 409', async () => {
    await unchanged(await api.assign(coordinatorLead, 'seed-req-a1-planning', { coordinatorUid: coordinator2.uid }), 409, NOT_UNASSIGNED)
  })

  it('a draft or a missing id → 404, so a draft is not revealed', async () => {
    await unchanged(await api.assign(coordinatorLead, DRAFT_ID, { coordinatorUid: coordinator2.uid }), 404, NOT_FOUND)
    await unchanged(await api.assign(coordinatorLead, 'no-such-request', { coordinatorUid: coordinator2.uid }), 404, NOT_FOUND)
    expect(api.stored(DRAFT_ID).assignedCoordinatorUid).toBeNull()
    expect((await api.candidates(coordinatorLead, DRAFT_ID)).status).toBe(404)
  })

  it.each([
    ['no Coordinator chosen', {}, TARGET_REQUIRED],
    ['the Lead themselves', { coordinatorUid: coordinatorLead.uid }, TARGET_IS_SELF],
    ['a non-Coordinator', { coordinatorUid: venueStaff.uid }, TARGET_NOT_COORDINATOR],
    ['an unknown uid', { coordinatorUid: 'seed-nobody' }, TARGET_NOT_COORDINATOR],
  ])('%s → 400', async (_label, body, reason) => {
    await unchanged(await api.assign(coordinatorLead, UNASSIGNED_ID, body), 400, reason)
    expect(api.stored(UNASSIGNED_ID).assignedCoordinatorUid).toBeNull()
    expect(api.activity(UNASSIGNED_ID)).toEqual([])
  })

  it('the request’s submitter, even holding the Coordinator role → 400', async () => {
    await unchanged(await api.assign(coordinatorLead, OWN_REQUEST_ID, { coordinatorUid: ORGANISER_COORDINATOR.uid }), 400, TARGET_IS_OWNER)
    const offered = (await api.candidates(coordinatorLead, OWN_REQUEST_ID)).json.candidates.map((candidate) => candidate.uid)
    expect(offered).not.toContain(ORGANISER_COORDINATOR.uid)
  })
})

describe('SPM-68 AC5/AC9 — only Leads assign; a Lead never assigns to themselves', () => {
  it.each([
    ['Coordinator', () => coordinator],
    ['Organiser who owns it', () => organiserA2],
    ['Venue Staff', () => venueStaff],
    ['Safety Officer', () => SEED_ACCOUNTS.safetyOfficer],
    ['Attendee', () => SEED_ACCOUNTS.attendee],
  ])('%s → 403 on assign and on the candidate list, nothing written', async (_label, account) => {
    const assign = await api.assign(account(), UNASSIGNED_ID, { coordinatorUid: coordinator2.uid })
    expect(assign.status).toBe(403)
    expect(assign.json.reason).toBe(NOT_PERMITTED)
    expect((await api.candidates(account(), UNASSIGNED_ID)).status).toBe(403)
    expect(api.stored(UNASSIGNED_ID).assignedCoordinatorUid).toBeNull()
  })

  it('no token → 401', async () => {
    expect((await api.assign(null, UNASSIGNED_ID, { coordinatorUid: coordinator2.uid })).status).toBe(401)
  })

  it('a Lead who is also a Coordinator cannot assign to themselves and is not offered themselves', async () => {
    const response = await api.assign(LEAD_COORDINATOR, UNASSIGNED_ID, { coordinatorUid: LEAD_COORDINATOR.uid })
    expect(response.status).toBe(400)
    expect(response.json.reason).toBe(TARGET_IS_SELF)
    const offered = (await api.candidates(LEAD_COORDINATOR, UNASSIGNED_ID)).json.candidates.map((candidate) => candidate.uid)
    expect(offered).not.toContain(LEAD_COORDINATOR.uid)
  })

  it('a Lead who is also a Coordinator can assign to another Coordinator, then has no Coordinator powers on it', async () => {
    expect((await api.assign(LEAD_COORDINATOR, UNASSIGNED_ID, { coordinatorUid: coordinator2.uid })).status).toBe(200)
    // SPM-69: it stays in view through the Lead role (they assigned it), with Lead powers only.
    const view = await api.view(LEAD_COORDINATOR, UNASSIGNED_ID)
    expect(view.status).toBe(200)
    expect(view.json.availableActions).toEqual([])
    expect(view.json.editableSections).toEqual([])
    expect((await api.transition(LEAD_COORDINATOR, UNASSIGNED_ID, START_REVIEW)).status).toBe(403)
  })

  it('a Lead cannot act as a Coordinator on a queued request: no review, no edits', async () => {
    expect((await api.transition(coordinatorLead, UNASSIGNED_ID, START_REVIEW)).status).toBe(403)
    const edit = await api.call('PATCH', `/api/requests/${UNASSIGNED_ID}`, coordinatorLead, { core: { title: 'Changed' } })
    expect(edit.status).toBe(403)
    expect(api.stored(UNASSIGNED_ID).core.title).toBe('A2 unassigned (waiting for a Coordinator)')
  })
})

describe('SPM-68 AC6 — the Organiser sees "Unassigned" until a Coordinator is assigned', () => {
  it('the owner and a same-organisation colleague get { assigned: false } on the request page', async () => {
    expect((await api.view(organiserA2, UNASSIGNED_ID)).json.assignedCoordinator).toEqual({ assigned: false, name: null })
    expect((await api.view(organiserA1, UNASSIGNED_ID)).json.assignedCoordinator).toEqual({ assigned: false, name: null })
  })

  it('after assignment the Organiser sees the Coordinator’s name', async () => {
    await api.assign(coordinatorLead, UNASSIGNED_ID, { coordinatorUid: coordinator3.uid })
    expect((await api.view(organiserA2, UNASSIGNED_ID)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator3.name })
  })

  it('the Organiser’s request list carries no Coordinator field, so there is nothing there to say "Unassigned"', async () => {
    const item = (await api.list(organiserA2)).json.requests.find((request) => request.id === UNASSIGNED_ID)
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('assignedCoordinatorUid')
    expect(item).not.toHaveProperty('assignedCoordinator')
  })
})
