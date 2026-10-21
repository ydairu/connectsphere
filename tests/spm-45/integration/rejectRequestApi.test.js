// SPM-45 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Not database verification,
// and there is no live-project variant: a live run would reject a seeded request.
//
// Seeded fixtures: seed-req-a1-under-review and seed-req-a1-planning, owned by organiser-a1 and assigned to
// `coordinator`; the Planning one also has the venue, technical and venue + technical staff assigned.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { PLANNING, REJECTED, UNDER_REVIEW } from '../../../shared/status.js'
import { ACTIONS, REJECT, RESUBMIT } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, organiserA2, coordinator, coordinator2, venueStaff, technicalStaff, venueTechnicalStaff } = SEED_ACCOUNTS
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'
const PLANNING_ID = 'seed-req-a1-planning'
const REASON = 'No available venue can hold 500 attendees on that date'
const api = createCancellationApi()

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

describe('SPM-45 — Coordinator rejects a request (API, in-memory only)', () => {
  it('spm45_seed_fixtures_are_assigned_to_coordinator', () => {
    expect(api.stored(UNDER_REVIEW_ID)).toMatchObject({ status: UNDER_REVIEW, ownerUid: organiserA1.uid, assignedCoordinatorUid: coordinator.uid })
    expect(api.stored(PLANNING_ID)).toMatchObject({ status: PLANNING, assignedCoordinatorUid: coordinator.uid })
  })

  // AC: "Given a rejection reason has been entered and the assigned Coordinator confirms the action, then the
  // event status changes to Rejected."
  it('spm45_assigned_coordinator_rejects_from_under_review_with_a_reason', async () => {
    expect((await api.view(coordinator, UNDER_REVIEW_ID)).json.availableActions).toContain(REJECT)
    const response = await api.act(coordinator, REJECT, `  ${REASON}  `, UNDER_REVIEW_ID)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(REJECTED)
    expect(response.json.rejection).toMatchObject({ reason: REASON, previousStatus: UNDER_REVIEW })
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(REJECTED)
  })

  // AC: "Given an event is in Planning, when a venue or technical arrangement has been rejected and no
  // acceptable alternative can fulfil an essential requirement, then the assigned Coordinator may initiate
  // rejection of the overall event."
  it('spm45_at_planning_after_the_venue_is_rejected_the_coordinator_may_reject_the_event', async () => {
    expect((await api.act(venueStaff, 'reject_venue', undefined, PLANNING_ID)).status).toBe(409)
    const response = await api.act(coordinator, REJECT, REASON, PLANNING_ID)
    expect(response.status).toBe(200)
    expect(api.stored(PLANNING_ID)).toMatchObject({ status: REJECTED, rejection: { previousStatus: PLANNING } })
  })

  // AC: "Rejection requires a reason" / "a rejection reason is required."
  it('spm45_reject_without_a_reason_is_not_saved', async () => {
    for (const reason of [undefined, '', '   ']) {
      const response = await api.act(coordinator, REJECT, reason, UNDER_REVIEW_ID)
      expect(response.status).toBe(400)
      expect(response.json).toMatchObject({ reason: 'reason_required', message: 'A reason is required for this action.' })
    }
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(api.stored(UNDER_REVIEW_ID).rejection).toBeUndefined()
    expect(api.activity(UNDER_REVIEW_ID)).toEqual([])
  })

  it('spm45_an_over_long_or_non_text_reason_is_refused', async () => {
    expect((await api.act(coordinator, REJECT, 'x'.repeat(1001), UNDER_REVIEW_ID)).json.reason).toBe('reason_invalid')
    expect((await api.act(coordinator, REJECT, 42, UNDER_REVIEW_ID)).json.reason).toBe('reason_invalid')
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
  })

  // AC: "Given rejection succeeds, then the rejection record retains the reason, deciding Coordinator,
  // previous status, new status, and date and time."
  it('spm45_the_rejection_record_and_activity_history_retain_every_detail', async () => {
    const before = Date.now()
    await api.act(coordinator, REJECT, REASON, UNDER_REVIEW_ID)
    const { rejection } = api.stored(UNDER_REVIEW_ID)
    expect(rejection).toMatchObject({ reason: REASON, previousStatus: UNDER_REVIEW, rejectedByUid: coordinator.uid })
    expect(Date.parse(rejection.rejectedAt)).toBeGreaterThanOrEqual(before - 1000)

    const [entry] = api.activity(UNDER_REVIEW_ID).filter((item) => item.type === STATUS_CHANGED)
    expect(entry).toMatchObject({
      action: REJECT,
      fromStatus: UNDER_REVIEW,
      toStatus: REJECTED,
      reason: REASON,
      actor: { type: 'user', uid: coordinator.uid },
      at: rejection.rejectedAt,
    })
  })

  it('spm45_a_coordinator_not_assigned_to_the_event_is_refused_with_404_and_nothing_changes', async () => {
    const refused = await api.act(coordinator2, REJECT, REASON, UNDER_REVIEW_ID)
    expect(refused.status).toBe(404)
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(api.activity(UNDER_REVIEW_ID)).toEqual([])
  })

  // AC: "Venue Staff and Technical Support Staff cannot directly change the overall event status to Rejected."
  it('spm45_venue_and_technical_staff_cannot_reject_the_overall_event', async () => {
    for (const account of [venueStaff, technicalStaff, venueTechnicalStaff]) {
      expect((await api.view(account, PLANNING_ID)).json.availableActions, account.uid).not.toContain(REJECT)
      const refused = await api.act(account, REJECT, REASON, PLANNING_ID)
      expect(refused.status, account.uid).toBe(403)
      expect(refused.json.reason).toBe('not_permitted')
    }
    expect(api.stored(PLANNING_ID).status).toBe(PLANNING)
  })

  // AC: "Given Venue Staff reject a venue-booking request ..., then the overall event remains in Planning."
  // AC: "Given Technical Support Staff reject an equipment or technical request, when the overall event has
  // not been rejected by the assigned Event Coordinator, then the event remains in Planning."
  it('spm45_a_venue_or_technical_rejection_keeps_the_event_in_planning', async () => {
    expect((await api.act(venueStaff, 'reject_venue', undefined, PLANNING_ID)).status).toBe(409)
    expect((await api.act(technicalStaff, 'reject_technical', undefined, PLANNING_ID)).json.request.status).toBe(PLANNING)
    expect(api.stored(PLANNING_ID).status).toBe(PLANNING)
    expect(api.stored(PLANNING_ID).rejection).toBeUndefined()
  })

  it('spm45_the_organiser_cannot_reject_their_own_request', async () => {
    expect((await api.act(organiserA1, REJECT, REASON, UNDER_REVIEW_ID)).status).toBe(403)
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
  })
})

describe('SPM-45 — the Organiser sees a closed, rejected request', () => {
  // AC: "Given an event becomes Rejected, when the Event Organiser views the request, then it is clearly
  // marked as Rejected and the rejection reason is displayed."
  it('spm45_the_owning_organiser_sees_the_rejected_status_and_reason', async () => {
    await api.act(coordinator, REJECT, REASON, UNDER_REVIEW_ID)
    const viewed = await api.view(organiserA1, UNDER_REVIEW_ID)
    expect(viewed.status).toBe(200)
    expect(viewed.json.request.status).toBe(REJECTED)
    expect(viewed.json.rejection).toEqual({ reason: REASON, rejectedAt: expect.any(String), previousStatus: UNDER_REVIEW })
    // Who rejected it is internal.
    expect(viewed.json.rejection).not.toHaveProperty('rejectedByUid')
    expect(viewed.json.request).not.toHaveProperty('rejection')
  })

  it('spm45_another_organiser_in_the_same_organisation_sees_the_reason_but_cannot_act', async () => {
    await api.act(coordinator, REJECT, REASON, UNDER_REVIEW_ID)
    const viewed = await api.view(organiserA2, UNDER_REVIEW_ID)
    expect(viewed.json.rejection).toMatchObject({ reason: REASON })
    expect(viewed.json.availableActions).toEqual([])
  })

  // AC: "Given an event is Rejected, then it is closed and cannot be edited or resubmitted through the
  // Returned-request workflow."
  it('spm45_a_rejected_request_cannot_be_resubmitted_or_change_status', async () => {
    await api.act(coordinator, REJECT, REASON, UNDER_REVIEW_ID)
    expect((await api.view(organiserA1, UNDER_REVIEW_ID)).json.availableActions).toEqual([])
    const resubmit = await api.act(organiserA1, RESUBMIT, undefined, UNDER_REVIEW_ID)
    expect(resubmit.status).toBe(409)
    expect(resubmit.json.reason).toBe('terminal_status')
    for (const action of ACTIONS) {
      expect((await api.act(coordinator, action, REASON, UNDER_REVIEW_ID)).status, action).toBe(409)
    }
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(REJECTED)
  })

  it('spm45_no_role_can_edit_any_section_of_a_rejected_request', async () => {
    await api.act(coordinator, REJECT, REASON, PLANNING_ID)
    const attempts = [
      [organiserA1, { core: { title: 'Try again' } }],
      [coordinator, { internal: { notes: 'Reopen' } }],
      [venueStaff, { venue: { layoutPreference: 'banquet' } }],
    ]
    for (const [account, patch] of attempts) {
      expect((await api.call('PATCH', `/api/requests/${PLANNING_ID}`, account, patch)).status, account.uid).toBe(403)
      expect((await api.view(account, PLANNING_ID)).json.editableSections, account.uid).toEqual([])
    }
    expect((await api.call('PATCH', `/api/event-requests/${PLANNING_ID}`, organiserA1, { core: { title: 'Try again' } })).status).not.toBe(200)
  })
})
