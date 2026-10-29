// SPM-68 AC2 and AC8 through the API: a first submission is not assigned and enters the Lead's queue; a returned
// request that is resubmitted goes back to its current Coordinator, not to the queue. In-memory harness
// (apiHarness.js) — not database verification.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { COORDINATOR_ASSIGNED } from '../../../backend/src/services/coordinatorAssignmentService.js'
import { RESUBMIT, RETURN_FOR_CLARIFICATION } from '../../../shared/statusTransitions.js'
import { SUBMITTED } from '../../../shared/status.js'
import { useApiHarness } from './apiHarness.js'

const api = useApiHarness()
const { coordinator, coordinatorLead, organiserA1, organiserA3 } = SEED_ACCOUNTS
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'

async function submitNewRequest() {
  const created = await api.call('POST', '/api/event-requests', organiserA3, {
    core: { title: 'Queue demo', purpose: 'SPM-68', expectedAttendees: 40, durationHours: 3, preferredDateTime: '2027-02-12T18:30:00+08:00' },
    venue: { layoutPreference: 'theatre' },
  })
  expect(created.status).toBe(201)
  const id = created.json.eventRequest.id
  const submitted = await api.call('POST', `/api/event-requests/${id}/submit`, organiserA3)
  expect(submitted.status).toBe(200)
  return { id, submitted: submitted.json.eventRequest }
}

describe('SPM-68 AC2 — a submitted request is not auto-assigned; it enters the unassigned queue', () => {
  it('is Submitted with no Coordinator, a submission time and no assignment entry', async () => {
    const { id, submitted } = await submitNewRequest()

    expect(submitted.status).toBe(SUBMITTED)
    expect(submitted.assignedCoordinatorUid).toBeNull()
    expect(api.stored(id).assignedCoordinatorUid).toBeNull()
    expect(api.stored(id).submittedAt).toEqual(expect.any(String))
    expect(api.activity(id).map((entry) => entry.type)).toEqual(['status_changed'])
    expect(api.db.collectionData('systemLocks').has('coordinatorAssignment')).toBe(false)
  })

  it('appears in the Lead’s queue and in no Coordinator’s list', async () => {
    const { id } = await submitNewRequest()

    expect((await api.queue(coordinatorLead)).json.requests.map((item) => item.id)).toContain(id)
    for (const account of [SEED_ACCOUNTS.coordinator, SEED_ACCOUNTS.coordinator2, SEED_ACCOUNTS.coordinator3]) {
      expect((await api.list(account)).json.requests.map((request) => request.id)).not.toContain(id)
    }
  })

  it('nobody can start its review while it is unassigned', async () => {
    const { id } = await submitNewRequest()

    const attempt = await api.transition(coordinator, id, 'start_review')
    expect(attempt.status).toBe(404)
    expect(api.stored(id).status).toBe(SUBMITTED)
  })
})

describe('SPM-68 AC8 — a returned request that is resubmitted goes back to its current Coordinator (CL3 G8!C15)', () => {
  it('keeps the Coordinator, records no assignment and never enters the queue', async () => {
    const returned = await api.transition(coordinator, UNDER_REVIEW_ID, RETURN_FOR_CLARIFICATION, 'Please confirm the attendance.')
    expect(returned.status).toBe(200)

    const resubmitted = await api.transition(organiserA1, UNDER_REVIEW_ID, RESUBMIT)
    expect(resubmitted.status).toBe(200)

    expect(api.stored(UNDER_REVIEW_ID).status).toBe(SUBMITTED)
    expect(api.stored(UNDER_REVIEW_ID).assignedCoordinatorUid).toBe(coordinator.uid)
    expect(api.activity(UNDER_REVIEW_ID).filter((entry) => entry.type === COORDINATOR_ASSIGNED)).toEqual([])
    expect((await api.queue(coordinatorLead)).json.requests.map((item) => item.id)).not.toContain(UNDER_REVIEW_ID)
    expect((await api.list(coordinator)).json.requests.map((request) => request.id)).toContain(UNDER_REVIEW_ID)
  })
})
