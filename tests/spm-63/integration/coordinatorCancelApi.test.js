// SPM-63 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Not database verification,
// and there is no live-project variant: a live run would cancel a seeded event and leave notifications.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { EVENT_CANCELLED_NOTICE } from '../../../shared/notifications.js'
import { CANCELLED, CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { ACTIONS, CANCEL, COMPLETE, REJECT } from '../../../shared/statusTransitions.js'
import { CONFIRMED_ID, createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, organiserA2, coordinator, coordinator3, venueStaff, technicalStaff, venueTechnicalStaff, attendee } = SEED_ACCOUNTS
const REASON = 'Venue closed for urgent repairs'
const api = createCancellationApi()

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

describe('SPM-63 — Coordinator cancels a Confirmed event (API, in-memory only)', () => {
  it('spm63_seed_fixture_is_confirmed_assigned_to_coordinator3_with_staff_and_starts_in_the_future', () => {
    expect(api.stored()).toMatchObject({ status: CONFIRMED, ownerUid: organiserA1.uid, assignedCoordinatorUid: coordinator3.uid })
    expect(api.stored().assignedStaffUids).toEqual([venueStaff.uid, technicalStaff.uid, venueTechnicalStaff.uid])
    expect(Date.parse(api.stored().core.preferredDateTime)).toBeGreaterThan(Date.now())
  })

  // AC: "Given a Confirmed event assigned to me, before its start date/time, when I select Cancel Event and
  // enter a reason, then the status changes to Cancelled."
  it('spm63_assigned_coordinator_cancels_with_a_reason_and_the_status_changes_to_cancelled', async () => {
    expect((await api.view(coordinator3)).json.availableActions).toContain(CANCEL)
    const response = await api.act(coordinator3, CANCEL, `  ${REASON}  `)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(CANCELLED)
    expect(api.stored().status).toBe(CANCELLED)
    expect(api.stored().cancellation).toMatchObject({ reason: REASON, requestedByOrganiser: false, cancelledByUid: coordinator3.uid })
  })

  // AC: "when I submit without a reason, then the cancellation is not saved and a message asks for a reason."
  it('spm63_cancel_without_a_reason_is_not_saved_and_asks_for_a_reason', async () => {
    for (const reason of [undefined, '', '   ']) {
      const response = await api.act(coordinator3, CANCEL, reason)
      expect(response.status).toBe(400)
      expect(response.json).toMatchObject({ reason: 'reason_required', message: 'A reason is required for this action.' })
    }
    expect(api.stored().status).toBe(CONFIRMED)
    expect(api.activity()).toEqual([])
    expect(api.allNotifications()).toEqual([])
  })

  // AC: "Given an event that is not Confirmed, when I view it, then Cancel Event is not available (Reject
  // applies instead)."
  it('spm63_cancel_is_not_available_before_confirmation_and_reject_is_offered_instead', async () => {
    for (const [id, status] of [['seed-req-a1-under-review', UNDER_REVIEW], ['seed-req-a1-planning', PLANNING]]) {
      const viewed = await api.view(coordinator, id)
      expect(viewed.json.request.status).toBe(status)
      expect(viewed.json.availableActions).not.toContain(CANCEL)
      expect(viewed.json.availableActions).toContain(REJECT)
      const refused = await api.act(coordinator, CANCEL, REASON, id)
      expect(refused.status).toBe(409)
      expect(refused.json.reason).toBe('wrong_status')
      expect(api.stored(id).status).toBe(status)
    }
  })

  // AC: "Given a Confirmed event whose start date/time has passed, when I view it, then Cancel Event is not
  // available."
  it('spm63_cancel_is_not_available_once_the_start_date_time_has_passed', async () => {
    api.setStart(CONFIRMED_ID, new Date(Date.now() - 60 * 1000))
    expect((await api.view(coordinator3)).json.availableActions).not.toContain(CANCEL)
    const refused = await api.act(coordinator3, CANCEL, REASON)
    expect(refused.status).toBe(409)
    expect(refused.json).toMatchObject({ reason: 'event_started' })
    expect(refused.json.message).toMatch(/start date\/time has passed/)
    expect(api.stored().status).toBe(CONFIRMED)
  })

  // AC: "Given a Confirmed event assigned to another Coordinator, when I try to cancel it, then the action
  // is denied."
  it('spm63_a_coordinator_not_assigned_to_the_event_is_denied_and_nothing_changes', async () => {
    const refused = await api.act(coordinator, CANCEL, REASON)
    expect(refused.status).toBe(404)
    expect(api.stored().status).toBe(CONFIRMED)
    expect(api.activity()).toEqual([])
    expect(api.allNotifications()).toEqual([])
  })

  it('spm63_no_other_role_can_cancel_directly', async () => {
    for (const account of [organiserA1, organiserA2, venueStaff, technicalStaff]) {
      expect((await api.act(account, CANCEL, REASON)).status, account.uid).toBe(403)
    }
    expect(api.stored().status).toBe(CONFIRMED)
  })

  // AC: "the activity history records the previous status, new status, reason, who cancelled it and when."
  it('spm63_the_activity_history_records_the_cancellation', async () => {
    const before = Date.now()
    await api.act(coordinator3, CANCEL, REASON)
    const [entry] = api.activity().filter((item) => item.type === STATUS_CHANGED)
    expect(entry).toMatchObject({
      action: CANCEL,
      fromStatus: CONFIRMED,
      toStatus: CANCELLED,
      reason: REASON,
      actor: { type: 'user', uid: coordinator3.uid },
    })
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(before - 1000)
  })

  // AC: "the Event Organiser is notified with the reason."
  it('spm63_the_organiser_is_notified_with_the_reason', async () => {
    await api.act(coordinator3, CANCEL, REASON)
    const [notice] = await api.notificationsOf(organiserA1)
    expect(notice).toMatchObject({ type: EVENT_CANCELLED_NOTICE, eventRequestId: CONFIRMED_ID, reason: REASON, readAt: null })
    expect(notice.message).toMatch(/has been cancelled/)
    expect(notice).not.toHaveProperty('recipientUid')
    // In-app on the event too.
    expect((await api.view(organiserA1)).json.cancellation).toMatchObject({ reason: REASON, requestedByOrganiser: false })
  })

  // AC: "the affected Venue Staff and Technical Support Staff are notified." Releasing the venue booking and
  // equipment reservations is NOT tested: no booking or reservation records exist yet.
  it('spm63_assigned_venue_and_technical_staff_are_notified_and_no_one_else', async () => {
    await api.act(coordinator3, CANCEL, REASON)
    for (const account of [venueStaff, technicalStaff, venueTechnicalStaff]) {
      const notices = await api.notificationsOf(account)
      expect(notices, account.uid).toHaveLength(1)
      expect(notices[0]).toMatchObject({ type: EVENT_CANCELLED_NOTICE, reason: REASON })
    }
    for (const account of [coordinator3, coordinator, organiserA2, attendee]) {
      expect(await api.notificationsOf(account), account.uid).toEqual([])
    }
    expect(api.allNotifications().map((notice) => notice.recipientUid).sort()).toEqual(
      [organiserA1.uid, venueStaff.uid, technicalStaff.uid, venueTechnicalStaff.uid].sort(),
    )
  })

  // AC: "Given a Cancelled event, when any user with access views it, then it is labelled Cancelled ... and
  // cannot be changed to another status." The list split is a page concern (requests.test.jsx).
  it('spm63_a_cancelled_event_shows_as_cancelled_to_every_user_with_access_and_accepts_no_action', async () => {
    await api.act(coordinator3, CANCEL, REASON)
    for (const account of [organiserA1, coordinator3, venueStaff, technicalStaff]) {
      const viewed = await api.view(account)
      expect(viewed.json.request.status, account.uid).toBe(CANCELLED)
      expect(viewed.json.availableActions, account.uid).toEqual([])
      expect(viewed.json.cancellation, account.uid).toMatchObject({ reason: REASON })
    }
    for (const action of ACTIONS) {
      const refused = await api.act(coordinator3, action, REASON)
      expect(refused.status, action).toBe(409)
    }
    expect((await api.act(coordinator3, COMPLETE)).json.reason).toBe('terminal_status')
    expect(api.stored().status).toBe(CANCELLED)
  })

  it('spm63_an_attendee_cannot_see_a_cancelled_event', async () => {
    await api.act(coordinator3, CANCEL, REASON)
    expect((await api.view(attendee)).status).toBe(403)
  })
})

describe('SPM-63 — notifications are each user’s own', () => {
  it('spm63_a_user_cannot_mark_someone_elses_notification_read', async () => {
    await api.act(coordinator3, CANCEL, REASON)
    const [notice] = await api.notificationsOf(organiserA1)
    expect((await api.call('POST', `/api/notifications/${notice.id}/read`, venueStaff)).status).toBe(404)
    const read = await api.call('POST', `/api/notifications/${notice.id}/read`, organiserA1)
    expect(read.status).toBe(200)
    expect(read.json.notification.readAt).not.toBeNull()
  })

  it('spm63_notifications_require_sign_in', async () => {
    expect((await api.call('GET', '/api/notifications')).status).toBe(401)
  })
})
