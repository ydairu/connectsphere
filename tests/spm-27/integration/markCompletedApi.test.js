// SPM-27 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Not database verification,
// and there is no live-project variant: a live run would complete a seeded event.
//
// Seeded fixture: seed-req-a1-confirmed, owned by organiser-a1, assigned to coordinator-3, with venue and
// technical staff assigned, 4 hours long. The harness moves its start 30 days ahead; tests that need the
// event to have taken place move it into the past.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { COMPLETED, CONFIRMED, PREPARATION } from '../../../shared/status.js'
import { ACTIONS, COMPLETE, START_PREPARATION } from '../../../shared/statusTransitions.js'
import { CONFIRMED_ID, createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, coordinator, coordinator3, venueStaff, technicalStaff, attendee } = SEED_ACCOUNTS
const HOUR = 60 * 60 * 1000
const api = createCancellationApi({ verifySafetyApproval: async () => true })

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

// The seeded event is 4 hours long; starting 5 hours ago, it has ended.
const endEvent = () => api.setStart(CONFIRMED_ID, new Date(Date.now() - 5 * HOUR))
const enterPreparation = async () => expect((await api.act(coordinator3, START_PREPARATION)).status).toBe(200)

describe('SPM-27 — Coordinator marks an event Completed (API, in-memory only)', () => {
  it('spm27_seed_fixture_is_confirmed_four_hours_long_and_assigned_to_coordinator3', () => {
    expect(api.stored()).toMatchObject({ status: CONFIRMED, assignedCoordinatorUid: coordinator3.uid, core: { durationHours: 4 } })
  })

  // AC: "Given a Confirmed event whose date has passed, when the Event Coordinator selects Mark as Completed,
  // then the event status changes to Completed."
  it('spm27_assigned_coordinator_marks_a_past_confirmed_event_completed', async () => {
    endEvent()
    await enterPreparation()
    expect((await api.view(coordinator3)).json.availableActions).toContain(COMPLETE)
    const response = await api.act(coordinator3, COMPLETE)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(COMPLETED)
    expect(api.stored().status).toBe(COMPLETED)
  })

  it('spm27_complete_is_refused_before_the_event_has_ended', async () => {
    // Started an hour ago, still running.
    api.setStart(CONFIRMED_ID, new Date(Date.now() - HOUR))
    await enterPreparation()
    expect((await api.view(coordinator3)).json.availableActions).not.toContain(COMPLETE)
    const refused = await api.act(coordinator3, COMPLETE)
    expect(refused.status).toBe(409)
    expect(refused.json).toMatchObject({ reason: 'event_not_ended', message: 'An event can be marked complete only after it has taken place.' })
    expect(api.stored().status).toBe(PREPARATION)
    expect(api.activity().filter((entry) => entry.action === COMPLETE)).toEqual([])
  })

  it('spm27_complete_is_refused_on_an_event_that_is_not_confirmed', async () => {
    const refused = await api.act(coordinator, COMPLETE, undefined, 'seed-req-a1-planning')
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('wrong_status')
  })

  it('spm27_a_coordinator_not_assigned_to_the_event_is_refused_with_404', async () => {
    endEvent()
    await enterPreparation()
    expect((await api.act(coordinator, COMPLETE)).status).toBe(404)
    expect(api.stored().status).toBe(PREPARATION)
  })

  it('spm27_no_other_role_can_mark_the_event_completed', async () => {
    endEvent()
    await enterPreparation()
    for (const account of [organiserA1, venueStaff, technicalStaff]) {
      expect((await api.act(account, COMPLETE)).status, account.uid).toBe(403)
    }
    expect(api.stored().status).toBe(PREPARATION)
  })

  // AC: "Given a Completed event, when the activity history is viewed, then the completion action records who
  // marked it complete and when."
  it('spm27_the_activity_history_records_who_marked_it_complete_and_when', async () => {
    endEvent()
    await enterPreparation()
    const before = Date.now()
    await api.act(coordinator3, COMPLETE)
    const [entry] = api.activity().filter((item) => item.type === STATUS_CHANGED && item.action === COMPLETE)
    expect(entry).toMatchObject({
      action: COMPLETE,
      fromStatus: PREPARATION,
      toStatus: COMPLETED,
      actor: { type: 'user', uid: coordinator3.uid, name: coordinator3.name },
    })
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(before - 1000)
    expect(api.stored().completion).toEqual({ completedByUid: coordinator3.uid, completedByName: coordinator3.name, completedAt: entry.at })
  })

  it('spm27_the_coordinator_sees_who_completed_it_and_the_organiser_and_staff_see_when', async () => {
    endEvent()
    await enterPreparation()
    await api.act(coordinator3, COMPLETE)
    const { completedAt } = api.stored().completion
    expect((await api.view(coordinator3)).json.completion).toEqual({ completedAt, completedByName: coordinator3.name })
    for (const account of [organiserA1, venueStaff]) {
      expect((await api.view(account)).json.completion, account.uid).toEqual({ completedAt })
    }
  })
})

describe('SPM-27 — a Completed event is closed and keeps its record', () => {
  // AC: "Completed is a terminal status; completed events retain their records for auditability."
  it('spm27_a_completed_event_accepts_no_action_and_keeps_its_details', async () => {
    endEvent()
    await enterPreparation()
    const original = api.stored()
    await api.act(coordinator3, COMPLETE)
    for (const action of ACTIONS) expect((await api.act(coordinator3, action, 'reason')).status, action).toBe(409)
    const stored = api.stored()
    expect(stored.status).toBe(COMPLETED)
    for (const key of ['core', 'venue', 'equipment', 'registration', 'internal', 'ownerUid', 'assignedCoordinatorUid', 'assignedStaffUids']) {
      expect(stored[key], key).toEqual(original[key])
    }
  })

  it('spm27_no_role_can_edit_a_completed_event', async () => {
    endEvent()
    await enterPreparation()
    await api.act(coordinator3, COMPLETE)
    for (const [account, patch] of [
      [coordinator3, { internal: { notes: 'After the event' } }],
      [venueStaff, { venue: { layoutPreference: 'banquet' } }],
      [organiserA1, { core: { title: 'Renamed' } }],
    ]) {
      expect((await api.call('PATCH', `/api/requests/${CONFIRMED_ID}`, account, patch)).status, account.uid).toBe(403)
    }
  })

  // AC: "Given a Completed event, when viewed in the event list, then it is clearly labelled as Completed".
  // The split into Closed events is a page concern (frontend/src/pages/rejectionCompletion.test.jsx).
  it('spm27_the_list_reports_the_completed_status_to_every_user_with_access', async () => {
    endEvent()
    await enterPreparation()
    await api.act(coordinator3, COMPLETE)
    for (const account of [organiserA1, coordinator3, venueStaff]) {
      const listed = (await api.list(account)).find((request) => request.id === CONFIRMED_ID)
      expect(listed?.status, account.uid).toBe(COMPLETED)
    }
    expect((await api.view(attendee)).status).toBe(403)
  })
})
