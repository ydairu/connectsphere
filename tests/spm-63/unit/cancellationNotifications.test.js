// SPM-63 and SPM-47 — who is notified of each cancellation action. Pure-function level: shared/notifications.js.
// That the notices are written in the action's transaction and read back per user is tested in the
// tests/spm-63 and tests/spm-47 integration suites.

import { describe, expect, it } from 'vitest'

import {
  CANCELLATION_REFUSED_NOTICE,
  CANCELLATION_REQUESTED_NOTICE,
  CANCELLATION_RESUBMITTED_NOTICE,
  CANCELLATION_RETURNED_NOTICE,
  EVENT_CANCELLED_NOTICE,
  cancellationNotifications,
} from '../../../shared/notifications.js'
import { REFUSE_CANCELLATION, REQUEST_CANCELLATION, RESUBMIT_CANCELLATION, RETURN_CANCELLATION } from '../../../shared/requestActions.js'
import { APPROVE, APPROVE_CANCELLATION, CANCEL } from '../../../shared/statusTransitions.js'

const AT = '2026-11-01T00:00:00.000Z'
const owner = { uid: 'org-1' }
const coordinator = { uid: 'coord-1' }
const request = {
  id: 'req-1',
  ownerUid: owner.uid,
  assignedCoordinatorUid: coordinator.uid,
  assignedStaffUids: ['venue-1', 'tech-1', 'venue-tech-1'],
  core: { title: 'Partner Forum' },
}

const recipients = (notices) => notices.map((notice) => notice.recipientUid)

describe('SPM-63 — a cancellation notifies the Organiser, the assigned staff and registered Attendees', () => {
  it('spm63_direct_cancel_notifies_the_organiser_and_every_assigned_staff_member_with_the_reason', () => {
    const notices = cancellationNotifications(CANCEL, request, coordinator, { reason: 'Venue closed', at: AT })
    expect(recipients(notices)).toEqual([owner.uid, 'venue-1', 'tech-1', 'venue-tech-1'])
    for (const notice of notices) {
      expect(notice).toMatchObject({ type: EVENT_CANCELLED_NOTICE, reason: 'Venue closed', eventRequestId: 'req-1', eventTitle: 'Partner Forum', createdAt: AT, readAt: null })
    }
  })

  it('spm63_registered_attendees_passed_in_are_notified', () => {
    const notices = cancellationNotifications(CANCEL, request, coordinator, { reason: 'Venue closed', at: AT, attendeeUids: ['att-1', 'att-2'] })
    expect(recipients(notices)).toEqual(expect.arrayContaining(['att-1', 'att-2']))
    expect(notices.find((notice) => notice.recipientUid === 'att-1').message).toMatch(/you registered for/)
  })

  it('spm63_the_coordinator_who_acted_is_not_notified_and_nobody_twice', () => {
    const selfStaffed = { ...request, assignedStaffUids: [coordinator.uid, 'venue-1', 'venue-1', null] }
    expect(recipients(cancellationNotifications(CANCEL, selfStaffed, coordinator, { reason: 'x', at: AT }))).toEqual([owner.uid, 'venue-1'])
  })

  it('spm63_an_event_with_no_assigned_staff_notifies_only_the_organiser', () => {
    const unstaffed = { ...request, assignedStaffUids: undefined }
    expect(recipients(cancellationNotifications(CANCEL, unstaffed, coordinator, { reason: 'x', at: AT }))).toEqual([owner.uid])
  })
})

describe('SPM-47 — cancellation request notices', () => {
  it('spm47_a_request_and_a_resubmission_notify_the_assigned_coordinator', () => {
    expect(cancellationNotifications(REQUEST_CANCELLATION, request, owner, { reason: 'r', at: AT })).toEqual([
      expect.objectContaining({ recipientUid: coordinator.uid, type: CANCELLATION_REQUESTED_NOTICE, reason: 'r' }),
    ])
    expect(cancellationNotifications(RESUBMIT_CANCELLATION, request, owner, { reason: 'r2', at: AT })).toEqual([
      expect.objectContaining({ recipientUid: coordinator.uid, type: CANCELLATION_RESUBMITTED_NOTICE, reason: 'r2' }),
    ])
  })

  it('spm47_a_return_and_a_refusal_notify_the_organiser_with_the_message_or_reason', () => {
    expect(cancellationNotifications(RETURN_CANCELLATION, request, coordinator, { reason: 'Which sessions?', at: AT })).toEqual([
      expect.objectContaining({ recipientUid: owner.uid, type: CANCELLATION_RETURNED_NOTICE, reason: 'Which sessions?' }),
    ])
    expect(cancellationNotifications(REFUSE_CANCELLATION, request, coordinator, { reason: 'Terms', at: AT })).toEqual([
      expect.objectContaining({ recipientUid: owner.uid, type: CANCELLATION_REFUSED_NOTICE, reason: 'Terms' }),
    ])
  })

  it('spm47_an_approval_notifies_like_a_cancellation_and_tells_the_organiser_their_request_was_approved', () => {
    const notices = cancellationNotifications(APPROVE_CANCELLATION, request, coordinator, { reason: 'Keynote withdrew', at: AT })
    expect(recipients(notices)).toEqual([owner.uid, 'venue-1', 'tech-1', 'venue-tech-1'])
    expect(notices[0].message).toMatch(/request was approved/)
  })

  it('spm47_other_actions_notify_no_one', () => {
    expect(cancellationNotifications(APPROVE, request, coordinator, { at: AT })).toEqual([])
  })
})
