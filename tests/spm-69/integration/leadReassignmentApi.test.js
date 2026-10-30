// SPM-69 through the API: the Event Coordinator Lead reassigns an active event between Coordinators; the
// Coordinators themselves no longer can. In-memory harness (tests/shared/helpers/cancellationApi.js: real HTTP and
// middleware, mocked token verification, fakeFirestore with the seeded requests, equipment requests and
// reservations) — not database verification, and two truly simultaneous reassignments are not modelled.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_EQUIPMENT_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ASSIGNMENT_LOCK_PATH } from '../../../backend/src/services/coordinatorAssignmentService.js'
import { COORDINATOR_REASSIGNED } from '../../../backend/src/services/coordinatorReassignmentService.js'
import { COORDINATOR_CHANGED, NOT_PERMITTED, TERMINAL_STATUS } from '../../../shared/coordinatorReassignment.js'
import { COORDINATOR_LEAD } from '../../../shared/permissions.js'
import { APPROVE, CANCEL, CONFIRM, REJECT, RETURN_FOR_CLARIFICATION, START_REVIEW } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'
import { approvedVenueFixture } from '../../spm-90/approvedVenueFixture.js'

const api = createCancellationApi({ includeReservations: true })
beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

const { coordinator, coordinator2, coordinator3, coordinatorLead: lead } = SEED_ACCOUNTS
const SECOND_LEAD = { uid: 'spm69-second-lead', name: 'Second Lead', email: 'lead-2@spm69.test', roles: [COORDINATOR_LEAD] }
const PLANNING_ID = 'seed-req-a1-planning'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const BOOKING_ID = 'spm69-approved-venue'
const TERMINAL_IDS = ['seed-req-a1-completed', 'seed-req-a1-cancelled', 'seed-req-a1-rejected']

const reassign = (account, id, body) => api.call('POST', `/api/event-requests/${id}/reassignment`, account, body)
const candidates = (account, id) => api.call('GET', `/api/event-requests/${id}/reassignment/candidates`, account)
const handTo = (to, id = PLANNING_ID) => ({ coordinatorUid: to.uid, expectedCoordinatorUid: api.stored(id).assignedCoordinatorUid })
const equipmentIds = async (account, id = PLANNING_ID) => {
  const response = await api.call('GET', `/api/requests/${id}/equipment-requests`, account)
  return response.status === 200 ? response.json.requests.map((request) => request.id).sort() : response.status
}
const bookingIds = async (account, id = PLANNING_ID) => {
  const response = await api.call('GET', `/api/requests/${id}/venue-bookings`, account)
  return response.status === 200 ? response.json.bookings.map((booking) => booking.id) : response.status
}
const addUser = ({ uid, ...profile }) => api.putDocument('users', uid, profile)

function addApprovedVenue() {
  const { booking, holdId, hold } = approvedVenueFixture(PLANNING_ID, BOOKING_ID)
  api.putDocument('venueBookingRequests', BOOKING_ID, booking)
  api.putDocument('venueAvailability', holdId, hold)
  return holdId
}

describe('SPM-69 AC1 — the Lead reassigns an active event and the history records it', () => {
  it('spm69_updates_the_assignment_and_records_previous_new_who_and_when_in_one_transaction', async () => {
    const response = await reassign(lead, PLANNING_ID, handTo(coordinator2))
    expect(response.status).toBe(200)
    expect(response.json).toEqual({ reassigned: true, coordinator: { name: coordinator2.name } })

    const stored = api.stored(PLANNING_ID)
    expect(stored).toMatchObject({ assignedCoordinatorUid: coordinator2.uid, assignedByUid: lead.uid })
    expect(stored.assignedAt).toBe(stored.updatedAt)
    const entries = api.activity(PLANNING_ID).filter((entry) => entry.type === COORDINATOR_REASSIGNED)
    expect(entries).toEqual([{
      type: COORDINATOR_REASSIGNED,
      previousCoordinatorUid: coordinator.uid,
      coordinatorUid: coordinator2.uid,
      actor: { type: 'user', uid: lead.uid, name: lead.name },
      at: stored.assignedAt,
    }])

    const writes = api.transactions().filter((transaction) => transaction.committed && transaction.writes.includes(`eventRequests/${PLANNING_ID}`))
    expect(writes).toHaveLength(1)
    const lock = ASSIGNMENT_LOCK_PATH.join('/')
    expect(writes[0].reads).toEqual([`eventRequests/${PLANNING_ID}`, 'users', 'users', lock])
    // The request, the activity entry, the lock and (SPM-84) three notices: new and previous Coordinator, Organiser.
    expect(writes[0].writes).toHaveLength(6)
    expect(writes[0].writes.filter((path) => path.startsWith('notifications/'))).toHaveLength(3)
    expect(writes[0].writes).toContain(lock)
    expect(writes[0].writes.some((path) => path.startsWith(`eventRequests/${PLANNING_ID}/activity/`))).toBe(true)
  })

  it('spm69_the_lead_finds_the_event_in_their_list_and_sees_who_has_it', async () => {
    const listed = (await api.call('GET', '/api/requests', lead)).json.requests.map((request) => request.id)
    expect(listed).toContain(PLANNING_ID)
    for (const id of TERMINAL_IDS) expect(listed).not.toContain(id)

    const page = await api.view(lead, PLANNING_ID)
    expect(page.status).toBe(200)
    expect(Object.keys(page.json.request).sort()).toEqual(['core', 'id', 'organisationName', 'status'])
    expect(page.json.assignedCoordinator).toEqual({ assigned: true, name: coordinator.name })
    expect(page.json.canReassignCoordinator).toBe(true)
  })

  it('spm69_candidates_show_workload_and_the_current_coordinator', async () => {
    const response = await candidates(lead, PLANNING_ID)
    expect(response.status).toBe(200)
    expect(response.json.currentCoordinator).toEqual({ uid: coordinator.uid, name: coordinator.name })
    expect(response.json.coordinators.map(({ uid }) => uid)).toEqual([coordinator2.uid, coordinator3.uid])
    for (const candidate of response.json.coordinators) expect(candidate.activeEvents).toEqual(expect.any(Number))
  })

  it('spm69_the_event_joins_the_reassigning_leads_supervision_and_leaves_any_other_leads', async () => {
    addUser(SECOND_LEAD)
    // Assigned before SPM-68, so any Lead may reach it (team decision, G8!C38).
    expect((await api.view(SECOND_LEAD, PLANNING_ID)).status).toBe(200)

    expect((await reassign(lead, PLANNING_ID, handTo(coordinator2))).status).toBe(200)

    expect((await api.view(SECOND_LEAD, PLANNING_ID)).status).toBe(403)
    const refused = await reassign(SECOND_LEAD, PLANNING_ID, handTo(coordinator3))
    expect(refused.status).toBe(403)
    expect(api.stored(PLANNING_ID).assignedCoordinatorUid).toBe(coordinator2.uid)
    expect((await api.view(lead, PLANNING_ID)).status).toBe(200)
  })
})

describe('SPM-69 AC4 — linked records stay with the event and reach the new Coordinator', () => {
  it('spm69_equipment_and_venue_requests_and_the_hold_follow_the_event', async () => {
    const holdId = addApprovedVenue()
    const seededEquipment = SEED_EQUIPMENT_REQUESTS.filter((request) => request.eventRequestId === PLANNING_ID).map(({ id }) => id).sort()
    expect(seededEquipment.length).toBeGreaterThan(0)
    expect(await equipmentIds(coordinator)).toEqual(seededEquipment)
    expect(await bookingIds(coordinator)).toEqual([BOOKING_ID])
    const historyBefore = api.activity(PLANNING_ID).length
    const holdBefore = structuredClone(api.documents('venueAvailability').find((hold) => hold.bookingRequestId === BOOKING_ID))

    expect((await reassign(lead, PLANNING_ID, handTo(coordinator2))).status).toBe(200)

    expect(await equipmentIds(coordinator2)).toEqual(seededEquipment)
    expect(await bookingIds(coordinator2)).toEqual([BOOKING_ID])
    expect(api.documents('venueAvailability').find((hold) => hold.bookingRequestId === BOOKING_ID)).toEqual(holdBefore)
    expect(holdId).toBeTruthy()
    expect(api.activity(PLANNING_ID)).toHaveLength(historyBefore + 1)
    expect((await api.call('GET', `/api/requests/${PLANNING_ID}/history`, coordinator2)).status).toBe(200)

    expect(await equipmentIds(coordinator)).toBe(404)
    expect(await bookingIds(coordinator)).toBe(404)
  })

  it('spm69_the_new_coordinator_can_act_and_edit_and_the_old_one_gets_404', async () => {
    expect((await reassign(lead, PLANNING_ID, handTo(coordinator2))).status).toBe(200)

    const page = await api.view(coordinator2, PLANNING_ID)
    expect(page.status).toBe(200)
    expect(page.json.availableActions.length).toBeGreaterThan(0)
    expect(page.json.editableSections).toContain('internal')
    const edit = await api.call('PATCH', `/api/requests/${PLANNING_ID}`, coordinator2, { internal: { notes: 'Handed over by the Lead.' } })
    expect(edit.status).toBe(200)

    expect((await api.view(coordinator, PLANNING_ID)).status).toBe(404)
    expect((await api.act(coordinator, REJECT, 'No longer mine', PLANNING_ID)).status).toBe(404)
  })
})

describe('SPM-69 AC2 — finished events cannot be reassigned', () => {
  it.each(TERMINAL_IDS)('spm69_%s_is_refused_with_409_and_unchanged', async (id) => {
    const before = structuredClone(api.stored(id))
    const response = await reassign(lead, id, handTo(coordinator3.uid === before.assignedCoordinatorUid ? coordinator2 : coordinator3, id))
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(TERMINAL_STATUS)
    expect(api.stored(id)).toEqual(before)
    expect((await candidates(lead, id)).status).toBe(409)
  })
})

describe('SPM-69 AC3 — Coordinators can no longer reassign events themselves', () => {
  it('spm69_the_assigned_coordinator_is_not_offered_reassign_and_is_refused_403', async () => {
    expect((await api.view(coordinator, PLANNING_ID)).json.canReassignCoordinator).toBe(false)
    expect((await candidates(coordinator, PLANNING_ID)).status).toBe(403)
    const response = await reassign(coordinator, PLANNING_ID, handTo(coordinator2))
    expect(response.status).toBe(403)
    expect(response.json.reason).toBe(NOT_PERMITTED)
    expect(api.stored(PLANNING_ID).assignedCoordinatorUid).toBe(coordinator.uid)
    expect(api.activity(PLANNING_ID).filter((entry) => entry.type === COORDINATOR_REASSIGNED)).toEqual([])
  })

  it('spm69_an_unassigned_coordinator_still_gets_404', async () => {
    expect((await reassign(coordinator3, PLANNING_ID, handTo(coordinator2))).status).toBe(404)
  })
})

describe('SPM-69 — a change made since the page loaded is refused', () => {
  it('spm69_a_stale_expected_coordinator_gets_409_and_nothing_is_written', async () => {
    const loaded = (await candidates(lead, PLANNING_ID)).json.currentCoordinator.uid
    expect((await reassign(lead, PLANNING_ID, { coordinatorUid: coordinator2.uid, expectedCoordinatorUid: loaded })).status).toBe(200)
    const after = structuredClone(api.stored(PLANNING_ID))

    const stale = await reassign(lead, PLANNING_ID, { coordinatorUid: coordinator3.uid, expectedCoordinatorUid: loaded })
    expect(stale.status).toBe(409)
    expect(stale.json.reason).toBe(COORDINATOR_CHANGED)
    expect(api.stored(PLANNING_ID)).toEqual(after)
    expect(api.activity(PLANNING_ID).filter((entry) => entry.type === COORDINATOR_REASSIGNED)).toHaveLength(1)
  })

  it('spm69_an_event_cancelled_since_the_page_loaded_gets_409', async () => {
    const loaded = handTo(coordinator, CONFIRMED_ID)
    expect((await api.act(coordinator3, CANCEL, 'Venue closed', CONFIRMED_ID)).status).toBe(200)
    const response = await reassign(lead, CONFIRMED_ID, loaded)
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(TERMINAL_STATUS)
  })
})

describe('SPM-69 AC5 — the Lead cannot approve, reject, return or confirm (CL3 G8!C13)', () => {
  it('spm69_the_lead_has_no_actions_or_edits_on_a_supervised_event_and_every_attempt_is_refused', async () => {
    for (const id of [PLANNING_ID, CONFIRMED_ID, 'seed-req-a1-under-review', 'seed-req-a1-submitted']) {
      const page = await api.view(lead, id)
      expect(page.status, id).toBe(200)
      expect(page.json.availableActions, id).toEqual([])
      expect(page.json.editableSections, id).toEqual([])
    }
    for (const [action, id] of [
      [START_REVIEW, 'seed-req-a1-submitted'],
      [APPROVE, 'seed-req-a1-under-review'],
      [REJECT, 'seed-req-a1-under-review'],
      [RETURN_FOR_CLARIFICATION, 'seed-req-a1-under-review'],
      [CONFIRM, PLANNING_ID],
    ]) {
      const before = structuredClone(api.stored(id))
      expect((await api.act(lead, action, 'Lead attempt', id)).status, action).toBe(403)
      expect(api.stored(id), action).toEqual(before)
    }
    expect((await api.call('PATCH', `/api/requests/${PLANNING_ID}`, lead, { core: { title: 'Lead edit' } })).status).toBe(403)
  })
})
