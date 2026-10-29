// SPM-41 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP against the real
// Express app: the status-change transaction (cancel, approved cancellation request) and the SPM-10 section edit
// (reschedule). Mocked: token verification and persistence. Not database verification.
//
// Each test registers Attendees on the seeded two-place event through the real SPM-19 route, with the event's
// start and registration period set relative to the real clock, because the API reads the real clock.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import {
  ATTENDEE_EVENT_CANCELLED_NOTICE,
  EVENT_CANCELLED_NOTICE,
  EVENT_RESCHEDULED_NOTICE,
  SIGNIFICANT_CHANGE_NOTICE,
} from '../../../shared/notifications.js'
import { REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { CANCELLED, PLANNING, PREPARATION } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, CANCEL, REJECT } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, coordinator, coordinator3, venueStaff, attendee, attendee2, attendee3 } = SEED_ACCOUNTS
const SMALL_ID = 'seed-req-a1-confirmed-small'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const DAY = 24 * 60 * 60 * 1000
const REASON = 'The venue is closed for repairs'
const api = createCancellationApi()

const iso = (offset) => new Date(Date.now() + offset).toISOString()
const register = (account, id = SMALL_ID) => api.call('POST', `/api/requests/${id}/registrations`, account)
const mine = async (account) => (await api.call('GET', '/api/registrations', account)).json.registrations
const editCore = (account, fields, id = SMALL_ID) => api.call('PATCH', `/api/requests/${id}`, account, { core: fields })
const attendeeNotices = async (account) => (await api.notificationsOf(account)).filter((notice) => [ATTENDEE_EVENT_CANCELLED_NOTICE, EVENT_RESCHEDULED_NOTICE].includes(notice.type))

// Start in 30 days, registration open now, two places.
function openRegistration(id = SMALL_ID) {
  const event = api.stored(id)
  api.updateStored(id, {
    core: { ...event.core, preferredDateTime: iso(30 * DAY) },
    registration: { ...event.registration, enabled: true, opensAt: iso(-DAY), closesAt: iso(29 * DAY), capacity: 2 },
  })
}

beforeAll(api.start)
afterAll(api.stop)
beforeEach(async () => {
  api.reset()
  openRegistration()
  openRegistration(CONFIRMED_ID)
  expect((await register(attendee)).status).toBe(201)
  expect((await register(attendee2)).status).toBe(201)
})

describe('SPM-41 AC3 — a cancellation notifies every registered Attendee', () => {
  it('spm41_the_coordinator_cancelling_notifies_each_registered_attendee_with_the_event_name', async () => {
    expect((await api.act(coordinator, CANCEL, REASON, SMALL_ID)).status).toBe(200)
    for (const account of [attendee, attendee2]) {
      const notices = await attendeeNotices(account)
      expect(notices, account.uid).toHaveLength(1)
      expect(notices[0]).toMatchObject({
        type: ATTENDEE_EVENT_CANCELLED_NOTICE,
        changeType: 'cancelled',
        eventRequestId: SMALL_ID,
        eventTitle: 'A1 confirmed (2 places, registration open)',
        reason: null,
      })
      expect(notices[0].message).toBe('“A1 confirmed (2 places, registration open)”, which you registered for, has been cancelled.')
    }
    expect(await api.notificationsOf(attendee3)).toEqual([])
  })

  it('spm41_an_approved_organiser_cancellation_request_notifies_them_too', async () => {
    expect((await api.act(organiserA1, REQUEST_CANCELLATION, 'Keynote speaker withdrew', SMALL_ID)).status).toBe(200)
    expect(await attendeeNotices(attendee)).toEqual([])
    expect((await api.act(coordinator, APPROVE_CANCELLATION, undefined, SMALL_ID)).status).toBe(200)
    expect(await attendeeNotices(attendee)).toEqual([expect.objectContaining({ type: ATTENDEE_EVENT_CANCELLED_NOTICE, reason: null })])
    expect(await attendeeNotices(attendee2)).toHaveLength(1)
  })

  it('spm41_an_event_cancelled_from_preparation_notifies_them', async () => {
    api.updateStored(SMALL_ID, { status: PREPARATION })
    expect((await api.act(coordinator, CANCEL, REASON, SMALL_ID)).status).toBe(200)
    expect(await attendeeNotices(attendee)).toHaveLength(1)
  })

  it('spm41_only_active_registrations_of_this_event_are_notified', async () => {
    api.putDocument('eventRegistrations', `${SMALL_ID}_${attendee3.uid}`, { eventRequestId: SMALL_ID, attendeeUid: attendee3.uid, status: 'withdrawn' })
    expect((await register(attendee3, CONFIRMED_ID)).status).toBe(201)
    await api.act(coordinator, CANCEL, REASON, SMALL_ID)
    expect(await attendeeNotices(attendee3)).toEqual([])
  })

  // E5 (team decision, 29 Oct 2026): after a reschedule the event is back in Planning, where it can only be
  // rejected. For its registered Attendees that is a cancellation, so they are told it is cancelled.
  it('spm41_e5_rejecting_an_event_that_still_has_registrations_tells_them_it_is_cancelled', async () => {
    await editCore(coordinator, { preferredDateTime: iso(40 * DAY) })
    expect(api.stored(SMALL_ID).status).toBe(PLANNING)
    expect((await api.act(coordinator, REJECT, REASON, SMALL_ID)).status).toBe(200)
    const cancelledNotices = (await attendeeNotices(attendee)).filter((notice) => notice.type === ATTENDEE_EVENT_CANCELLED_NOTICE)
    expect(cancelledNotices).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, reason: null })])
  })

  it('spm41_a_refused_cancellation_sends_attendees_nothing', async () => {
    expect((await api.act(coordinator3, CANCEL, REASON, SMALL_ID)).status).toBe(404)
    expect((await api.act(coordinator, CANCEL, undefined, SMALL_ID)).status).toBe(400)
    expect(await attendeeNotices(attendee)).toEqual([])
  })
})

describe('SPM-41 AC4 — a reschedule notifies every registered Attendee with the new date and time', () => {
  it('spm41_a_new_date_and_time_notifies_each_attendee_with_the_new_and_previous_times', async () => {
    const previous = api.stored(SMALL_ID).core.preferredDateTime
    const next = iso(40 * DAY)
    const saved = await editCore(coordinator, { preferredDateTime: next })
    expect(saved.status).toBe(200)
    expect(saved.json.request.status).toBe(PLANNING)
    for (const account of [attendee, attendee2]) {
      const [notice] = await attendeeNotices(account)
      expect(notice, account.uid).toMatchObject({
        type: EVENT_RESCHEDULED_NOTICE,
        changeType: 'rescheduled',
        eventRequestId: SMALL_ID,
        eventTitle: 'A1 confirmed (2 places, registration open)',
        eventStartsAt: next,
        previousStartsAt: previous,
      })
    }
  })

  it('spm41_e1_a_duration_change_is_a_reschedule_with_the_new_end_time', async () => {
    const start = api.stored(SMALL_ID).core.preferredDateTime
    expect((await editCore(coordinator, { durationHours: 6 })).status).toBe(200)
    const [notice] = await attendeeNotices(attendee)
    expect(notice).toMatchObject({ type: EVENT_RESCHEDULED_NOTICE, eventStartsAt: start, eventEndsAt: new Date(Date.parse(start) + 6 * 60 * 60 * 1000).toISOString() })
  })

  it('spm41_e2_a_further_change_while_back_in_planning_notifies_them_again', async () => {
    await editCore(coordinator, { preferredDateTime: iso(40 * DAY) })
    expect(api.stored(SMALL_ID).status).toBe(PLANNING)
    await editCore(coordinator, { preferredDateTime: iso(45 * DAY) })
    expect(await attendeeNotices(attendee)).toHaveLength(2)
  })

  it('spm41_an_edit_that_does_not_move_the_date_or_time_notifies_no_attendee', async () => {
    expect((await editCore(coordinator, { title: 'A1 confirmed, renamed' })).status).toBe(200)
    expect(await attendeeNotices(attendee)).toEqual([])
  })
})

describe('SPM-41 AC6 — no registered Attendees, no Attendee notices; Organiser and staff notices still apply', () => {
  it('spm41_cancelling_an_event_without_registrations_notifies_only_the_organiser_and_staff', async () => {
    expect((await api.act(coordinator3, CANCEL, REASON, CONFIRMED_ID)).status).toBe(200)
    expect(api.allNotifications().filter((notice) => notice.eventRequestId === CONFIRMED_ID).every((notice) => notice.type === EVENT_CANCELLED_NOTICE)).toBe(true)
    expect(await api.notificationsOf(organiserA1)).toEqual([expect.objectContaining({ type: EVENT_CANCELLED_NOTICE, eventRequestId: CONFIRMED_ID })])
    expect(await api.notificationsOf(venueStaff)).toHaveLength(1)
  })

  it('spm41_rescheduling_an_event_without_registrations_notifies_only_the_staff', async () => {
    expect((await editCore(coordinator3, { preferredDateTime: iso(40 * DAY) }, CONFIRMED_ID)).status).toBe(200)
    const notices = api.allNotifications().filter((notice) => notice.eventRequestId === CONFIRMED_ID)
    expect(notices.length).toBeGreaterThan(0)
    expect(notices.every((notice) => notice.type === SIGNIFICANT_CHANGE_NOTICE)).toBe(true)
  })
})

describe('SPM-41 E3 — My registrations shows the event as it now is', () => {
  it('spm41_after_a_reschedule_my_registrations_shows_the_new_time', async () => {
    const next = iso(40 * DAY)
    await editCore(coordinator, { preferredDateTime: next })
    expect(await mine(attendee)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, eventStartsAt: next, eventStatus: PLANNING })])
  })

  it('spm41_after_a_cancellation_my_registrations_shows_the_event_as_cancelled', async () => {
    await api.act(coordinator, CANCEL, REASON, SMALL_ID)
    expect(await mine(attendee)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, eventStatus: CANCELLED, status: 'registered' })])
  })
})
