// SPM-61 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP against the real
// Express app, authenticate middleware and status-transition transaction; mocked token verification and
// persistence. Not database verification, and there is no live-project variant: a live run would change
// seeded statuses and leave notifications behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import {
  REQUEST_APPROVED_NOTICE,
  REQUEST_CONFIRMED_NOTICE,
  REQUEST_REJECTED_NOTICE,
  REQUEST_RETURNED_NOTICE,
} from '../../../shared/notifications.js'
import { APPROVE_TECHNICAL } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING, REJECTED, RETURNED, UNDER_REVIEW } from '../../../shared/status.js'
import { APPROVE, CONFIRM, REJECT, RETURN_FOR_CLARIFICATION, START_REVIEW } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'
import { approvedVenueFixture } from '../../spm-90/approvedVenueFixture.js'

const { organiserA1, organiserA2, organiserB1, coordinator, coordinator2, venueStaff, technicalStaff, venueTechnicalStaff, attendee } = SEED_ACCOUNTS
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'
const PLANNING_ID = 'seed-req-a1-planning'
const SUBMITTED_ID = 'seed-req-a1-submitted'
const MESSAGE = 'Please confirm the expected attendance.'
const REASON = 'The venue cannot hold the expected attendance.'
const api = createCancellationApi()

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

async function expectSaved(account, action, id, reason) {
  const response = await api.act(account, action, reason, id)
  expect(response.status, `${action} on ${id}`).toBe(200)
  return response
}

// Venue and technical sign-off, so the assigned Coordinator may confirm the Planning event (SPM-9, SPM-79).
async function approveArrangements() {
  const { booking, holdId, hold } = approvedVenueFixture(PLANNING_ID, 'spm61-venue-approved')
  api.putDocument('venueBookingRequests', 'spm61-venue-approved', booking)
  api.putDocument('venueAvailability', holdId, hold)
  await expectSaved(technicalStaff, APPROVE_TECHNICAL, PLANNING_ID)
  // SPM-91/92: Confirm also needs a recorded safety approval.
  api.setSafetyApproval(true, PLANNING_ID)
}

describe('SPM-61 — the Organiser is notified of each status change (API, in-memory only)', () => {
  it('spm61_seed_fixtures_are_owned_by_organiser_a1_and_assigned_to_seed_coordinator', () => {
    for (const [id, status] of [[UNDER_REVIEW_ID, UNDER_REVIEW], [PLANNING_ID, PLANNING]]) {
      expect(api.stored(id), id).toMatchObject({ status, ownerUid: organiserA1.uid, assignedCoordinatorUid: coordinator.uid })
    }
  })

  it('spm61_approval_notifies_the_organiser', async () => {
    await expectSaved(coordinator, APPROVE, UNDER_REVIEW_ID)
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(PLANNING)
    const [notice] = await api.notificationsOf(organiserA1)
    expect(notice).toMatchObject({ type: REQUEST_APPROVED_NOTICE, eventRequestId: UNDER_REVIEW_ID, eventTitle: 'A1 under review', reason: null, readAt: null })
    expect(notice.message).toMatch(/approved and moved to Planning/)
    expect(notice).not.toHaveProperty('recipientUid')
  })

  it('spm61_rejection_from_under_review_or_planning_notifies_the_organiser_with_the_reason', async () => {
    await expectSaved(coordinator, REJECT, UNDER_REVIEW_ID, REASON)
    await expectSaved(coordinator, REJECT, PLANNING_ID, `  ${REASON}  `)
    expect(api.stored(PLANNING_ID).status).toBe(REJECTED)

    const notices = await api.notificationsOf(organiserA1)
    const byEvent = Object.fromEntries(notices.map((notice) => [notice.eventRequestId, notice]))
    expect(byEvent[UNDER_REVIEW_ID]).toMatchObject({ type: REQUEST_REJECTED_NOTICE, reason: REASON })
    expect(byEvent[UNDER_REVIEW_ID].message).toMatch(/rejected during review/)
    expect(byEvent[PLANNING_ID]).toMatchObject({ type: REQUEST_REJECTED_NOTICE, reason: REASON })
    expect(byEvent[PLANNING_ID].message).toMatch(/rejected during planning/)
  })

  it('spm61_confirmation_notifies_the_organiser', async () => {
    await approveArrangements()
    expect(await api.notificationsOf(organiserA1)).toEqual([])

    await expectSaved(coordinator, CONFIRM, PLANNING_ID)
    expect(api.stored(PLANNING_ID).status).toBe(CONFIRMED)
    const [notice] = await api.notificationsOf(organiserA1)
    expect(notice).toMatchObject({ type: REQUEST_CONFIRMED_NOTICE, eventRequestId: PLANNING_ID, eventTitle: 'A1 planning (all staff assigned)' })
    expect(notice.message).toMatch(/is confirmed/)
    // The confirmed arrangements the notice points to are on the event page.
    expect((await api.view(organiserA1, PLANNING_ID)).json.arrangements).toMatchObject({ venue: { decision: 'approved' }, technical: { decision: 'approved' } })
  })

  it('spm61_return_notifies_the_organiser_with_the_message_and_the_request_is_editable_from_its_page', async () => {
    await expectSaved(coordinator, RETURN_FOR_CLARIFICATION, UNDER_REVIEW_ID, MESSAGE)
    const [notice] = await api.notificationsOf(organiserA1)
    expect(notice).toMatchObject({ type: REQUEST_RETURNED_NOTICE, eventRequestId: UNDER_REVIEW_ID, eventTitle: 'A1 under review', reason: MESSAGE })
    // The notice links to /requests/:id, where the owner of a returned request may edit it.
    const viewed = await api.view(organiserA1, UNDER_REVIEW_ID)
    expect(viewed.json.request.status).toBe(RETURNED)
    expect(viewed.json.editableSections).toEqual(expect.arrayContaining(['core', 'venue', 'equipment', 'registration']))
  })

  it('spm61_each_notice_names_the_right_event_when_the_organiser_has_several', async () => {
    await expectSaved(coordinator, RETURN_FOR_CLARIFICATION, UNDER_REVIEW_ID, MESSAGE)
    await expectSaved(coordinator, REJECT, PLANNING_ID, REASON)
    const notices = await api.notificationsOf(organiserA1)
    expect(notices.map(({ eventRequestId, eventTitle, type }) => ({ eventRequestId, eventTitle, type })).sort((a, b) => a.eventRequestId.localeCompare(b.eventRequestId))).toEqual([
      { eventRequestId: PLANNING_ID, eventTitle: 'A1 planning (all staff assigned)', type: REQUEST_REJECTED_NOTICE },
      { eventRequestId: UNDER_REVIEW_ID, eventTitle: 'A1 under review', type: REQUEST_RETURNED_NOTICE },
    ])
  })

  it('spm61_only_the_owning_organiser_is_notified', async () => {
    await expectSaved(coordinator, APPROVE, UNDER_REVIEW_ID)
    await expectSaved(coordinator, REJECT, PLANNING_ID, REASON)
    for (const account of [organiserA2, organiserB1, coordinator, coordinator2, venueStaff, technicalStaff, venueTechnicalStaff, attendee]) {
      expect(await api.notificationsOf(account), account.uid).toEqual([])
    }
    expect(api.allNotifications().map((notice) => notice.recipientUid)).toEqual([organiserA1.uid, organiserA1.uid])
  })

  it('spm61_starting_review_notifies_no_one', async () => {
    await expectSaved(coordinator, START_REVIEW, SUBMITTED_ID)
    expect(api.allNotifications()).toEqual([])
  })
})

describe('SPM-61 — a refused action sends nothing', () => {
  it('spm61_an_unassigned_coordinator_is_refused_and_nothing_is_sent', async () => {
    for (const [action, id, reason] of [[APPROVE, UNDER_REVIEW_ID], [REJECT, PLANNING_ID, REASON], [RETURN_FOR_CLARIFICATION, UNDER_REVIEW_ID, MESSAGE], [CONFIRM, PLANNING_ID]]) {
      expect((await api.act(coordinator2, action, reason, id)).status, action).toBe(404)
    }
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(api.allNotifications()).toEqual([])
  })

  it('spm61_other_roles_are_refused_and_nothing_is_sent', async () => {
    for (const account of [organiserA1, venueStaff, technicalStaff]) {
      expect((await api.act(account, REJECT, REASON, PLANNING_ID)).status, account.uid).toBe(403)
    }
    expect(api.allNotifications()).toEqual([])
  })

  it('spm61_a_missing_reason_or_message_is_refused_and_nothing_is_sent', async () => {
    expect((await api.act(coordinator, REJECT, '   ', UNDER_REVIEW_ID)).status).toBe(400)
    expect((await api.act(coordinator, RETURN_FOR_CLARIFICATION, undefined, UNDER_REVIEW_ID)).status).toBe(400)
    expect(api.stored(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(api.allNotifications()).toEqual([])
  })

  it('spm61_an_action_at_the_wrong_status_or_before_arrangements_are_approved_sends_nothing', async () => {
    expect((await api.act(coordinator, APPROVE, undefined, PLANNING_ID)).status).toBe(409)
    expect((await api.act(coordinator, CONFIRM, undefined, PLANNING_ID)).json.reason).toBe('arrangements_not_approved')
    expect(api.stored(PLANNING_ID).status).toBe(PLANNING)
    expect(api.allNotifications()).toEqual([])
  })
})
