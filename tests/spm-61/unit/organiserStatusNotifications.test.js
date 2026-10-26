// SPM-61 — who is notified when the assigned Coordinator approves, rejects, confirms or returns a request.
// Pure-function level: statusChangeNotifications() in shared/notifications.js. That the notices are written in
// the status change's transaction, and only for a saved action, is tested in the SPM-61 API suite.

import { describe, expect, it } from 'vitest'

import {
  REQUEST_APPROVED_NOTICE,
  REQUEST_CONFIRMED_NOTICE,
  REQUEST_REJECTED_NOTICE,
  REQUEST_RETURNED_NOTICE,
  statusChangeNotifications,
} from '../../../shared/notifications.js'
import { REFUSE_CANCELLATION, REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import {
  APPROVE,
  APPROVE_CANCELLATION,
  CANCEL,
  COMPLETE,
  CONFIRM,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  SUBMIT,
} from '../../../shared/statusTransitions.js'

const AT = '2026-11-01T00:00:00.000Z'
const owner = { uid: 'org-1' }
const coordinator = { uid: 'coord-1' }
const request = {
  id: 'req-1',
  status: UNDER_REVIEW,
  ownerUid: owner.uid,
  organisationId: 'org-a',
  assignedCoordinatorUid: coordinator.uid,
  assignedStaffUids: ['venue-1', 'tech-1'],
  core: { title: 'Partner Forum' },
}

const notify = (action, record = request, options = {}) => statusChangeNotifications(action, record, coordinator, { at: AT, ...options })

describe('SPM-61 — each status change notifies the owning Organiser', () => {
  it('spm61_approval_notifies_the_organiser_that_the_request_moved_to_planning', () => {
    expect(notify(APPROVE)).toEqual([
      {
        recipientUid: owner.uid,
        type: REQUEST_APPROVED_NOTICE,
        message: '“Partner Forum” has been approved and moved to Planning. The event coordinator will now arrange the venue and equipment.',
        reason: null,
        eventRequestId: 'req-1',
        eventTitle: 'Partner Forum',
        createdAt: AT,
        readAt: null,
      },
    ])
  })

  it('spm61_rejection_notifies_the_organiser_with_the_reason_and_the_stage', () => {
    const [underReview] = notify(REJECT, request, { reason: 'Venue capacity cannot be met' })
    expect(underReview).toMatchObject({ recipientUid: owner.uid, type: REQUEST_REJECTED_NOTICE, reason: 'Venue capacity cannot be met' })
    expect(underReview.message).toBe('“Partner Forum” has been rejected during review.')

    const [planning] = notify(REJECT, { ...request, status: PLANNING }, { reason: 'No suitable date' })
    expect(planning.message).toBe('“Partner Forum” has been rejected during planning.')
  })

  it('spm61_confirmation_notifies_the_organiser_that_the_arrangements_are_approved', () => {
    const [notice] = notify(CONFIRM, { ...request, status: PLANNING })
    expect(notice).toMatchObject({ recipientUid: owner.uid, type: REQUEST_CONFIRMED_NOTICE, eventRequestId: 'req-1', reason: null })
    expect(notice.message).toMatch(/is confirmed\. Its required venue and technical arrangements have been approved\./)
  })

  it('spm61_return_notifies_the_organiser_with_the_clarification_message', () => {
    const [notice] = notify(RETURN_FOR_CLARIFICATION, request, { reason: 'Please confirm the expected attendance.' })
    expect(notice).toMatchObject({
      recipientUid: owner.uid,
      type: REQUEST_RETURNED_NOTICE,
      reason: 'Please confirm the expected attendance.',
      eventRequestId: 'req-1',
      eventTitle: 'Partner Forum',
    })
    expect(notice.message).toMatch(/returned “Partner Forum” for clarification\. Update the request and resubmit it\./)
  })
})

describe('SPM-61 — nobody else is notified', () => {
  it('spm61_only_the_owner_is_notified_not_colleagues_staff_or_the_coordinator', () => {
    for (const action of [APPROVE, REJECT, CONFIRM, RETURN_FOR_CLARIFICATION]) {
      expect(notify(action, request, { reason: 'x' }).map((notice) => notice.recipientUid), action).toEqual([owner.uid])
    }
  })

  it('spm61_the_user_who_acted_is_not_notified_of_their_own_action', () => {
    expect(statusChangeNotifications(APPROVE, request, owner, { at: AT })).toEqual([])
  })

  it('spm61_a_request_without_an_owner_notifies_no_one', () => {
    expect(notify(APPROVE, { ...request, ownerUid: undefined })).toEqual([])
  })

  it('spm61_other_actions_notify_no_one', () => {
    for (const action of [SUBMIT, RESUBMIT, START_REVIEW, COMPLETE, CANCEL, APPROVE_CANCELLATION, REQUEST_CANCELLATION, REFUSE_CANCELLATION]) {
      expect(notify(action, request, { reason: 'x' }), action).toEqual([])
    }
  })

  it('spm61_each_notice_names_its_own_event', () => {
    const other = { ...request, id: 'req-2', core: { title: 'Board Dinner' } }
    expect(notify(APPROVE, other)[0]).toMatchObject({ eventRequestId: 'req-2', eventTitle: 'Board Dinner' })
    expect(notify(APPROVE, other)[0].message).toMatch(/^“Board Dinner”/)
  })
})
