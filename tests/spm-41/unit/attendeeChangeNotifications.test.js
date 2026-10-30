// SPM-41 — what registered Attendees are told when their event is cancelled or rescheduled. Pure functions:
// attendeeChangeNotifications() in shared/notifications.js and eventRescheduled() in shared/registration.js.
// That the backend finds the registered Attendees and sends these in the right transaction is the API suite.

import { describe, expect, it } from 'vitest'

import {
  ATTENDEE_EVENT_CANCELLED_NOTICE,
  EVENT_CANCELLED_NOTICE,
  EVENT_RESCHEDULED_NOTICE,
  attendeeChangeNotifications,
  cancellationNotifications,
} from '../../../shared/notifications.js'
import { eventEndsAt, eventRescheduled } from '../../../shared/registration.js'
import { CANCEL } from '../../../shared/statusTransitions.js'

const AT = '2026-11-01T00:00:00.000Z'
const coordinator = { uid: 'coord-1' }
const before = {
  id: 'event-1',
  ownerUid: 'org-1',
  assignedCoordinatorUid: coordinator.uid,
  assignedStaffUids: ['venue-1'],
  core: { title: 'Partner Forum', preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: 3 },
}
const after = { ...before, core: { ...before.core, preferredDateTime: '2026-11-27T10:00:00.000Z' } }

describe('SPM-41 AC1/AC2/AC5 — the notice names the event, the type of change and the new time', () => {
  it('spm41_a_cancellation_notice_names_the_event_and_says_it_was_cancelled', () => {
    expect(attendeeChangeNotifications('cancelled', before, before, coordinator, { attendeeUids: ['att-1'], at: AT })).toEqual([{
      recipientUid: 'att-1',
      type: ATTENDEE_EVENT_CANCELLED_NOTICE,
      changeType: 'cancelled',
      message: '“Partner Forum”, which you registered for, has been cancelled.',
      reason: null,
      eventRequestId: 'event-1',
      eventTitle: 'Partner Forum',
      createdAt: AT,
      readAt: null,
    }])
  })

  it('spm41_a_reschedule_notice_gives_the_new_and_previous_date_and_time', () => {
    const [notice] = attendeeChangeNotifications('rescheduled', before, after, coordinator, { attendeeUids: ['att-1'], at: AT })
    expect(notice).toMatchObject({
      recipientUid: 'att-1',
      type: EVENT_RESCHEDULED_NOTICE,
      changeType: 'rescheduled',
      message: '“Partner Forum”, which you registered for, has been rescheduled.',
      eventStartsAt: '2026-11-27T10:00:00.000Z',
      eventEndsAt: '2026-11-27T13:00:00.000Z',
      previousStartsAt: '2026-11-20T09:00:00.000Z',
      previousEndsAt: '2026-11-20T12:00:00.000Z',
      reason: null,
    })
  })

  it('spm41_every_registered_attendee_gets_one_notice', () => {
    const notices = attendeeChangeNotifications('cancelled', before, before, coordinator, { attendeeUids: ['att-1', 'att-2', 'att-1', null], at: AT })
    expect(notices.map((notice) => notice.recipientUid)).toEqual(['att-1', 'att-2'])
  })
})

describe('SPM-41 AC6 — no registered Attendees, no Attendee notices', () => {
  it('spm41_no_attendees_means_no_notices', () => {
    expect(attendeeChangeNotifications('cancelled', before, before, coordinator, { attendeeUids: [], at: AT })).toEqual([])
    expect(attendeeChangeNotifications('rescheduled', before, after, coordinator, { at: AT })).toEqual([])
  })

  it('spm41_a_cancellation_still_notifies_the_organiser_and_staff_and_gives_attendees_no_reason', () => {
    const notices = cancellationNotifications(CANCEL, before, coordinator, { reason: 'Venue flooded', at: AT, attendeeUids: ['att-1'] })
    expect(notices.filter((notice) => notice.type === EVENT_CANCELLED_NOTICE).map((notice) => notice.recipientUid)).toEqual(['org-1', 'venue-1'])
    expect(notices.find((notice) => notice.recipientUid === 'att-1')).toMatchObject({ type: ATTENDEE_EVENT_CANCELLED_NOTICE, reason: null })
  })
})

describe('SPM-41 AC4 / E1 — what counts as a reschedule', () => {
  it('spm41_a_new_start_date_or_time_is_a_reschedule', () => {
    expect(eventRescheduled(before, after)).toBe(true)
  })

  it('spm41_e1_a_new_duration_is_a_reschedule_because_the_end_time_moves', () => {
    expect(eventRescheduled(before, { ...before, core: { ...before.core, durationHours: 4 } })).toBe(true)
    expect(eventEndsAt({ preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: 4 })).toBe('2026-11-20T13:00:00.000Z')
  })

  it('spm41_the_same_instant_written_differently_or_another_field_is_not_a_reschedule', () => {
    expect(eventRescheduled(before, { ...before, core: { ...before.core, preferredDateTime: '2026-11-20T17:00:00+08:00' } })).toBe(false)
    expect(eventRescheduled(before, { ...before, core: { ...before.core, title: 'Renamed', expectedAttendees: 90 } })).toBe(false)
  })

  it('spm41_an_unknown_end_time_is_reported_as_null', () => {
    expect(eventEndsAt({ preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: null })).toBeNull()
  })
})
