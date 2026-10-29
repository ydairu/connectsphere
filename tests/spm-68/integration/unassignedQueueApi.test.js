// SPM-68 AC3 and AC5 through the API: GET /api/requests/unassigned lists only unassigned submitted requests,
// oldest first, with basic event information, and only to Event Coordinator Leads. In-memory harness
// (apiHarness.js) — not database verification.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { COORDINATOR_LEAD } from '../../../shared/permissions.js'
import { DRAFT, PLANNING, SUBMITTED } from '../../../shared/status.js'
import { UNASSIGNED_ID, useApiHarness } from './apiHarness.js'

const LEGACY_ID = 'spm68-legacy-unassigned'
const OLDER_ID = 'spm68-older-unassigned'
const OTHER_LEADS_ID = 'spm68-assigned-by-another-lead'
const core = (title) => ({ title, preferredDateTime: '2026-12-01T10:00:00+08:00', durationHours: 2, expectedAttendees: 30, description: 'not in the queue' })

const api = useApiHarness({
  extraRequests: {
    // Submitted before the field existed: no assignedCoordinatorUid at all, and no submittedAt.
    [LEGACY_ID]: { status: SUBMITTED, ownerUid: 'seed-organiser-b1', organisationId: 'org-b', organisationName: 'Seed Organisation B', core: core('Legacy record'), createdAt: '2026-10-20T00:00:00.000Z' },
    [OLDER_ID]: { status: SUBMITTED, ownerUid: 'seed-organiser-a1', organisationName: 'Seed Organisation A', assignedCoordinatorUid: null, core: core('Older'), submittedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-30T00:00:00.000Z' },
    'spm68-unassigned-draft': { status: DRAFT, ownerUid: 'seed-organiser-a1', assignedCoordinatorUid: null, core: core('Draft'), createdAt: '2026-09-01T00:00:00.000Z' },
    // SPM-69: assigned by the second Lead, so outside the seeded Lead's scope (CL3 G8!C41).
    [OTHER_LEADS_ID]: { status: PLANNING, ownerUid: 'seed-organiser-a1', organisationName: 'Seed Organisation A', assignedCoordinatorUid: 'seed-coordinator', assignedByUid: 'seed-coordinator-lead-2', core: core('Other Lead’s event'), createdAt: '2026-09-01T00:00:00.000Z' },
  },
  extraUsers: {
    'seed-coordinator-lead-2': { name: 'Second Lead', roles: [COORDINATOR_LEAD] },
  },
})
const { coordinatorLead } = SEED_ACCOUNTS

describe('SPM-68 AC3 — the Lead opens the queue', () => {
  it('lists every unassigned submitted request, oldest first, including a record with the field missing', async () => {
    const response = await api.queue(coordinatorLead)
    expect(response.status).toBe(200)
    expect(response.json.requests.map((item) => item.id)).toEqual([OLDER_ID, LEGACY_ID, UNASSIGNED_ID])
  })

  it('never lists drafts, assigned submitted requests or any other status', async () => {
    const ids = (await api.queue(coordinatorLead)).json.requests.map((item) => item.id)
    for (const excluded of ['spm68-unassigned-draft', 'seed-req-a1-submitted', 'seed-req-a2-submitted', 'seed-req-a1-returned', 'seed-req-a1-planning']) {
      expect(ids).not.toContain(excluded)
    }
  })

  it('each item has the basic event information only', async () => {
    const item = (await api.queue(coordinatorLead)).json.requests.find((entry) => entry.id === UNASSIGNED_ID)
    expect(item).toEqual({
      id: UNASSIGNED_ID,
      title: 'A2 unassigned (waiting for a Coordinator)',
      preferredDateTime: '2026-12-10T14:00:00+08:00',
      durationHours: 4,
      expectedAttendees: 80,
      organisationName: SEED_ACCOUNTS.organiserA2.organisationName,
      submittedAt: '2026-10-28T09:30:00+08:00',
    })
  })

  it('more than one Lead can open it (CL3 G8!C33)', async () => {
    const response = await api.queue({ uid: 'seed-coordinator-lead-2' })
    expect(response.status).toBe(200)
    expect(response.json.requests).toHaveLength(3)
  })

  it('the Lead’s request list holds the unassigned requests, and the request page shows basic information', async () => {
    // SPM-69 adds the active events the Lead supervises to the list (tests/spm-69); the queue is all here.
    const ids = (await api.list(coordinatorLead)).json.requests.map((request) => request.id)
    expect(ids).toEqual(expect.arrayContaining([LEGACY_ID, OLDER_ID, UNASSIGNED_ID]))
    expect(ids).not.toContain('spm68-unassigned-draft')

    const page = await api.view(coordinatorLead, UNASSIGNED_ID)
    expect(page.status).toBe(200)
    expect(Object.keys(page.json.request).sort()).toEqual(['core', 'id', 'organisationName', 'status'])
    expect(page.json.editableSections).toEqual([])
    expect(page.json.availableActions).toEqual([])
    expect(page.json.canReassignCoordinator).toBe(false)
  })

  it('a request another Lead assigned is not readable by the Lead (SPM-69, CL3 G8!C41)', async () => {
    expect((await api.view(coordinatorLead, OTHER_LEADS_ID)).status).toBe(403)
  })
})

describe('SPM-68 AC5 — only Event Coordinator Leads can view the queue', () => {
  it.each([
    ['Organiser', SEED_ACCOUNTS.organiserA2],
    ['Coordinator', SEED_ACCOUNTS.coordinator],
    ['Venue Staff', SEED_ACCOUNTS.venueStaff],
    ['Technical Support Staff', SEED_ACCOUNTS.technicalStaff],
    ['Attendee', SEED_ACCOUNTS.attendee],
    ['Safety Officer', SEED_ACCOUNTS.safetyOfficer],
  ])('%s gets 403', async (_label, account) => {
    const response = await api.queue(account)
    expect(response.status).toBe(403)
    expect(response.json).not.toHaveProperty('requests')
  })

  it('no token gets 401', async () => {
    expect((await api.queue(null)).status).toBe(401)
  })
})
