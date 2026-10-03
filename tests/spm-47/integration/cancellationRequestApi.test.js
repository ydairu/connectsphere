// SPM-47 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Not database verification,
// and there is no live-project variant: a live run would cancel a seeded event and leave notifications.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { CANCELLATION_DECIDED, CANCELLATION_REQUESTED } from '../../../backend/src/services/statusTransitionService.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import {
  CANCELLATION_REFUSED_NOTICE,
  CANCELLATION_REQUESTED_NOTICE,
  CANCELLATION_RESUBMITTED_NOTICE,
  CANCELLATION_RETURNED_NOTICE,
  EVENT_CANCELLED_NOTICE,
} from '../../../shared/notifications.js'
import {
  REFUSE_CANCELLATION,
  REQUEST_CANCELLATION,
  RESUBMIT_CANCELLATION,
  RETURN_CANCELLATION,
} from '../../../shared/requestActions.js'
import { CANCELLED, CONFIRMED } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, CANCEL } from '../../../shared/statusTransitions.js'
import { CONFIRMED_ID, createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, organiserA2, coordinator, coordinator3, venueStaff, technicalStaff, venueTechnicalStaff } = SEED_ACCOUNTS
const REASON = 'Keynote speaker withdrew'
const api = createCancellationApi()

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

const request = (reason = REASON) => api.act(organiserA1, REQUEST_CANCELLATION, reason)
const typesOf = async (account) => (await api.notificationsOf(account)).map((notice) => notice.type)

describe('SPM-47 — the Organiser requests cancellation (API, in-memory only)', () => {
  // AC: "Given a Confirmed event I own, before its start date/time, when I select Request Cancellation and
  // enter a reason, then the request is sent to the assigned Coordinator, who is notified."
  it('spm47_the_owner_requests_with_a_reason_and_the_assigned_coordinator_is_notified', async () => {
    expect((await api.view(organiserA1)).json.availableActions).toEqual([REQUEST_CANCELLATION])
    const response = await request()
    expect(response.status).toBe(200)
    // "The event stays Confirmed until the Coordinator approves."
    expect(response.json.request.status).toBe(CONFIRMED)
    expect(response.json.cancellationRequest).toMatchObject({ status: 'pending', reason: REASON })

    const [notice] = await api.notificationsOf(coordinator3)
    expect(notice).toMatchObject({ type: CANCELLATION_REQUESTED_NOTICE, reason: REASON, eventRequestId: CONFIRMED_ID })
    expect(await api.notificationsOf(coordinator)).toEqual([])
    expect(await api.notificationsOf(organiserA1)).toEqual([])
  })

  // AC: "Given I submit a request without a reason, then it is not sent and a message asks for a reason."
  it('spm47_a_request_without_a_reason_is_not_sent', async () => {
    for (const reason of [undefined, '', '  ']) {
      const response = await api.act(organiserA1, REQUEST_CANCELLATION, reason)
      expect(response.status).toBe(400)
      expect(response.json.message).toBe('A reason is required for this action.')
    }
    expect(api.stored().cancellationRequest).toBeUndefined()
    expect(api.allNotifications()).toEqual([])
  })

  // AC: "Given an event that is not Confirmed, or whose start date/time has passed, when I view it, then
  // Request Cancellation is not available."
  it('spm47_request_cancellation_is_not_available_before_confirmation', async () => {
    const id = 'seed-req-a1-planning'
    expect((await api.view(organiserA1, id)).json.availableActions).not.toContain(REQUEST_CANCELLATION)
    expect((await api.act(organiserA1, REQUEST_CANCELLATION, REASON, id)).json.reason).toBe('not_confirmed')
  })

  it('spm47_request_cancellation_is_not_available_after_the_start_date_time', async () => {
    api.setStart(CONFIRMED_ID, new Date(Date.now() - 60 * 1000))
    expect((await api.view(organiserA1)).json.availableActions).not.toContain(REQUEST_CANCELLATION)
    const refused = await request()
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('event_started')
  })

  // AC: "Only the Organiser who owns the event can request."
  it('spm47_only_the_owning_organiser_can_request', async () => {
    expect((await api.act(organiserA2, REQUEST_CANCELLATION, REASON)).status).toBe(403)
    expect((await api.act(coordinator3, REQUEST_CANCELLATION, REASON)).status).toBe(403)
    expect((await api.act(venueStaff, REQUEST_CANCELLATION, REASON)).status).toBe(403)
    expect(api.stored().cancellationRequest).toBeUndefined()
  })

  // AC: "Given a cancellation request is already open, when I view the event, then I can't submit another and
  // I see the request's status." "One open cancellation request per event at a time."
  it('spm47_with_a_request_open_the_owner_cannot_submit_another_and_sees_its_status', async () => {
    await request()
    const viewed = await api.view(organiserA1)
    expect(viewed.json.availableActions).toEqual([])
    expect(viewed.json.cancellationRequest).toMatchObject({ status: 'pending', reason: REASON })
    const refused = await request('Another reason')
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('cancellation_already_pending')
    expect(api.stored().cancellationRequest.reason).toBe(REASON)
  })
})

describe('SPM-47 — the assigned Coordinator decides', () => {
  // AC: "when the assigned Coordinator approves it, then the event is cancelled as defined in SPM-63 (status,
  // history, releases, notifications, label) and the Organiser is notified." Releases are NOT tested: no
  // booking or reservation records exist yet.
  it('spm47_approval_cancels_the_event_as_spm63_defines_and_notifies_the_organiser_and_staff', async () => {
    await request()
    const coordinatorView = await api.view(coordinator3)
    expect(coordinatorView.json.availableActions).toEqual([APPROVE_CANCELLATION, REFUSE_CANCELLATION, RETURN_CANCELLATION])
    expect(coordinatorView.json.cancellationRequest).toMatchObject({ status: 'pending', reason: REASON })

    const approved = await api.act(coordinator3, APPROVE_CANCELLATION)
    expect(approved.status).toBe(200)
    expect(approved.json.request.status).toBe(CANCELLED)
    expect(approved.json.availableActions).toEqual([])
    expect(approved.json.cancellation).toMatchObject({ reason: REASON, requestedByOrganiser: true })

    expect(api.activity().filter((entry) => entry.type === STATUS_CHANGED)).toEqual([
      expect.objectContaining({ action: APPROVE_CANCELLATION, fromStatus: CONFIRMED, toStatus: CANCELLED, actor: expect.objectContaining({ uid: coordinator3.uid }) }),
    ])

    const [organiserNotice] = await api.notificationsOf(organiserA1)
    expect(organiserNotice).toMatchObject({ type: EVENT_CANCELLED_NOTICE, reason: REASON })
    expect(organiserNotice.message).toMatch(/request was approved/)
    for (const account of [venueStaff, technicalStaff, venueTechnicalStaff]) {
      expect(await typesOf(account), account.uid).toEqual([EVENT_CANCELLED_NOTICE])
    }
    expect((await api.view(organiserA1)).json.request.status).toBe(CANCELLED)
  })

  // AC: "when the assigned Coordinator rejects it with a reason, then the event remains Confirmed and the
  // Organiser is notified with the reason."
  it('spm47_refusal_needs_a_reason_keeps_the_event_confirmed_and_notifies_the_organiser', async () => {
    await request()
    expect((await api.act(coordinator3, REFUSE_CANCELLATION)).status).toBe(400)
    const refused = await api.act(coordinator3, REFUSE_CANCELLATION, 'Outside the cancellation terms')
    expect(refused.status).toBe(200)
    expect(refused.json.request.status).toBe(CONFIRMED)

    const [notice] = await api.notificationsOf(organiserA1)
    expect(notice).toMatchObject({ type: CANCELLATION_REFUSED_NOTICE, reason: 'Outside the cancellation terms' })
    expect((await api.view(organiserA1)).json.cancellationRequest).toMatchObject({ status: 'refused', decisionReason: 'Outside the cancellation terms' })
    // The request is closed, so the Organiser may ask again.
    expect((await api.view(organiserA1)).json.availableActions).toEqual([REQUEST_CANCELLATION])
  })

  // AC: "when the assigned Coordinator needs more information, then they can return it with a message, and
  // Organiser can update and resubmit it."
  it('spm47_the_coordinator_returns_it_with_a_message_and_the_organiser_updates_and_resubmits', async () => {
    await request()
    expect((await api.act(coordinator3, RETURN_CANCELLATION)).status).toBe(400)
    const returned = await api.act(coordinator3, RETURN_CANCELLATION, 'Which sessions are affected?')
    expect(returned.status).toBe(200)
    expect(returned.json.request.status).toBe(CONFIRMED)

    const organiserView = await api.view(organiserA1)
    expect(organiserView.json.cancellationRequest).toMatchObject({ status: 'returned', returnMessage: 'Which sessions are affected?' })
    expect(organiserView.json.availableActions).toEqual([RESUBMIT_CANCELLATION])
    expect(await api.notificationsOf(organiserA1)).toEqual([
      expect.objectContaining({ type: CANCELLATION_RETURNED_NOTICE, reason: 'Which sessions are affected?' }),
    ])
    // Still open: no second request, and no approval until it is resubmitted.
    expect((await request('A new request')).json.reason).toBe('cancellation_request_returned')
    expect((await api.act(coordinator3, APPROVE_CANCELLATION)).json.reason).toBe('no_pending_cancellation')

    expect((await api.act(organiserA1, RESUBMIT_CANCELLATION)).status).toBe(400)
    const resubmitted = await api.act(organiserA1, RESUBMIT_CANCELLATION, 'All afternoon sessions; the keynote withdrew')
    expect(resubmitted.status).toBe(200)
    expect(resubmitted.json.cancellationRequest).toMatchObject({ status: 'pending', reason: 'All afternoon sessions; the keynote withdrew' })
    expect(await typesOf(coordinator3)).toEqual([CANCELLATION_RESUBMITTED_NOTICE, CANCELLATION_REQUESTED_NOTICE])

    expect((await api.act(coordinator3, APPROVE_CANCELLATION)).json.request.status).toBe(CANCELLED)
    expect(api.stored().cancellation.reason).toBe('All afternoon sessions; the keynote withdrew')
  })

  // AC: "when another Coordinator who is not assigned tries to approve, reject or return it, then the action is
  // denied." [Team decision, 3 Oct 2026] They cannot view it either, consistent with SPM-65.
  it('spm47_an_unassigned_coordinator_is_denied_every_decision_and_cannot_view_the_request', async () => {
    await request()
    for (const [action, reason] of [[APPROVE_CANCELLATION], [REFUSE_CANCELLATION, 'No'], [RETURN_CANCELLATION, 'More?']]) {
      expect((await api.act(coordinator, action, reason)).status, action).toBe(404)
    }
    expect((await api.view(coordinator)).status).toBe(404)
    expect((await api.list(coordinator)).map((item) => item.id)).not.toContain(CONFIRMED_ID)
    expect(api.stored()).toMatchObject({ status: CONFIRMED, cancellationRequest: expect.objectContaining({ status: 'pending' }) })
  })

  it('spm47_the_owner_cannot_decide_their_own_request', async () => {
    await request()
    for (const [action, reason] of [[APPROVE_CANCELLATION], [REFUSE_CANCELLATION, 'No'], [RETURN_CANCELLATION, 'More?']]) {
      expect((await api.act(organiserA1, action, reason)).status, action).toBe(403)
    }
  })

  // AC: "when the event's start date/time passes before a decision, then it can no longer be approved and the
  // Coordinator is shown why."
  it('spm47_once_the_start_passes_the_request_can_no_longer_be_approved_and_the_reason_is_given', async () => {
    await request()
    api.setStart(CONFIRMED_ID, new Date(Date.now() - 60 * 1000))
    expect((await api.view(coordinator3)).json.availableActions).toEqual([REFUSE_CANCELLATION])
    const refused = await api.act(coordinator3, APPROVE_CANCELLATION)
    expect(refused.status).toBe(409)
    expect(refused.json).toMatchObject({ reason: 'event_started' })
    expect(refused.json.message).toMatch(/start date\/time has passed/)
    expect(api.stored().status).toBe(CONFIRMED)
  })

  it('spm47_while_a_request_is_open_the_coordinator_cannot_cancel_directly', async () => {
    await request()
    expect((await api.act(coordinator3, CANCEL, 'Venue closed')).json.reason).toBe('cancellation_request_pending')
  })
})

describe('SPM-47 — every decision is in the activity history', () => {
  // AC: "Given any decision on a request, then the activity history records the action, actor, reason or
  // message, and time."
  it('spm47_request_return_resubmit_refuse_and_approve_are_each_recorded', async () => {
    await request()
    await api.act(coordinator3, RETURN_CANCELLATION, 'Which sessions?')
    await api.act(organiserA1, RESUBMIT_CANCELLATION, 'All of them')
    await api.act(coordinator3, REFUSE_CANCELLATION, 'Contract terms')
    await request('Second attempt')
    await api.act(coordinator3, APPROVE_CANCELLATION)

    const entries = api
      .activity()
      .filter((entry) => entry.type === CANCELLATION_REQUESTED || entry.type === CANCELLATION_DECIDED)
      .map(({ type, action, reason, actor, at }) => ({ type, action, reason, actor: actor.uid, hasTime: !Number.isNaN(Date.parse(at)) }))
    expect(entries).toEqual([
      { type: CANCELLATION_REQUESTED, action: REQUEST_CANCELLATION, reason: REASON, actor: organiserA1.uid, hasTime: true },
      { type: CANCELLATION_DECIDED, action: RETURN_CANCELLATION, reason: 'Which sessions?', actor: coordinator3.uid, hasTime: true },
      { type: CANCELLATION_REQUESTED, action: RESUBMIT_CANCELLATION, reason: 'All of them', actor: organiserA1.uid, hasTime: true },
      { type: CANCELLATION_DECIDED, action: REFUSE_CANCELLATION, reason: 'Contract terms', actor: coordinator3.uid, hasTime: true },
      { type: CANCELLATION_REQUESTED, action: REQUEST_CANCELLATION, reason: 'Second attempt', actor: organiserA1.uid, hasTime: true },
      { type: CANCELLATION_DECIDED, action: APPROVE_CANCELLATION, reason: null, actor: coordinator3.uid, hasTime: true },
    ])
  })
})
