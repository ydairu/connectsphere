// SPM-84 — who is told, and what, when the Event Coordinator Lead assigns or reassigns a Coordinator. Pure function:
// coordinatorAssignmentNotifications() in shared/notifications.js. That the services write these in the assignment's
// transaction is the API suite.

import { describe, expect, it } from 'vitest'

import {
  EVENT_ASSIGNED_TO_YOU_NOTICE,
  EVENT_COORDINATOR_ASSIGNED_NOTICE,
  EVENT_REASSIGNED_AWAY_NOTICE,
  coordinatorAssignmentNotifications,
} from '../../../shared/notifications.js'

const AT = '2026-10-30T02:00:00.000Z'
const START = '2026-12-10T14:00:00+08:00'
const lead = { uid: 'lead-1', roles: ['coordinator_lead'] }
const ada = { uid: 'coord-ada', name: 'Ada' }
const request = {
  id: 'req-1',
  status: 'submitted',
  ownerUid: 'organiser-1',
  organisationId: 'org-a',
  assignedCoordinatorUid: null,
  core: { title: 'Partner forum', preferredDateTime: START },
}
const planning = { ...request, status: 'planning', assignedCoordinatorUid: 'coord-old' }

const assign = (overrides = {}) => coordinatorAssignmentNotifications(request, lead, { change: 'assigned', coordinator: ada, at: AT, ...overrides })
const reassign = (overrides = {}, record = planning, actor = lead) =>
  coordinatorAssignmentNotifications(record, actor, { change: 'reassigned', coordinator: ada, previousCoordinatorUid: record.assignedCoordinatorUid, at: AT, ...overrides })
const common = { eventRequestId: 'req-1', eventTitle: 'Partner forum', createdAt: AT, readAt: null, reason: null }

describe('SPM-84 AC1 — the Lead assigns a Coordinator', () => {
  it('spm84_the_coordinator_and_the_owning_organiser_are_notified_and_the_organiser_is_told_who', () => {
    expect(assign()).toEqual([
      { ...common, recipientUid: ada.uid, type: EVENT_ASSIGNED_TO_YOU_NOTICE, change: 'assigned', message: '“Partner forum” has been assigned to you.', eventStartsAt: START },
      { ...common, recipientUid: 'organiser-1', type: EVENT_COORDINATOR_ASSIGNED_NOTICE, change: 'assigned', message: 'Ada is now the Event Coordinator for “Partner forum”.', eventStartsAt: START },
    ])
  })

  it('spm84_a_coordinator_without_a_name_is_not_named_to_the_organiser', () => {
    for (const name of [undefined, null, '', '  ']) {
      const organiser = assign({ coordinator: { uid: ada.uid, name } }).find((notice) => notice.type === EVENT_COORDINATOR_ASSIGNED_NOTICE)
      expect(organiser.message).toBe('An Event Coordinator has been assigned to “Partner forum”.')
    }
  })
})

describe('SPM-84 AC2 — the Lead reassigns the event', () => {
  it('spm84_the_new_and_previous_coordinator_and_the_owning_organiser_are_notified', () => {
    expect(reassign()).toEqual([
      { ...common, recipientUid: ada.uid, type: EVENT_ASSIGNED_TO_YOU_NOTICE, change: 'reassigned', message: '“Partner forum” has been reassigned to you.', eventStartsAt: START },
      { ...common, recipientUid: 'coord-old', type: EVENT_REASSIGNED_AWAY_NOTICE, change: 'reassigned', message: '“Partner forum” has been reassigned to Ada. You no longer manage it.' },
      { ...common, recipientUid: 'organiser-1', type: EVENT_COORDINATOR_ASSIGNED_NOTICE, change: 'reassigned', message: 'Ada is now the Event Coordinator for “Partner forum”.', eventStartsAt: START },
    ])
  })

  it('spm84_the_previous_coordinators_notice_carries_no_event_start', () => {
    const away = reassign().find((notice) => notice.type === EVENT_REASSIGNED_AWAY_NOTICE)
    expect(away).not.toHaveProperty('eventStartsAt')
  })

  it('spm84_a_nameless_new_coordinator_is_not_named_to_anyone', () => {
    const notices = reassign({ coordinator: { uid: ada.uid } })
    expect(notices.find((notice) => notice.type === EVENT_REASSIGNED_AWAY_NOTICE).message).toBe('“Partner forum” has been reassigned to another Event Coordinator. You no longer manage it.')
    expect(notices.find((notice) => notice.type === EVENT_COORDINATOR_ASSIGNED_NOTICE).message).toBe('An Event Coordinator has been assigned to “Partner forum”.')
  })

  it('spm84_an_assignment_never_notifies_a_previous_coordinator', () => {
    expect(assign({ previousCoordinatorUid: 'coord-old' }).map((notice) => notice.recipientUid)).toEqual([ada.uid, 'organiser-1'])
  })
})

describe('SPM-84 AC4 — the acting Lead and other Leads are not notified (CL3 G8!C43)', () => {
  it('spm84_only_the_coordinators_and_the_owning_organiser_ever_receive_a_notice', () => {
    for (const notices of [assign(), reassign()]) {
      expect(notices.map((notice) => notice.recipientUid)).not.toContain(lead.uid)
      for (const notice of notices) expect([ada.uid, 'coord-old', 'organiser-1']).toContain(notice.recipientUid)
    }
  })

  it('spm84_a_lead_who_was_the_previous_coordinator_is_not_told_of_their_own_reassignment', () => {
    const leadCoordinator = { uid: 'lead-coord', roles: ['coordinator_lead', 'coordinator'] }
    const theirs = { ...planning, assignedCoordinatorUid: leadCoordinator.uid }
    expect(reassign({}, theirs, leadCoordinator).map((notice) => notice.recipientUid)).toEqual([ada.uid, 'organiser-1'])
  })

  it('spm84_an_event_without_an_owner_notifies_only_the_coordinators', () => {
    expect(reassign({}, { ...planning, ownerUid: undefined }).map((notice) => notice.recipientUid)).toEqual([ada.uid, 'coord-old'])
  })
})

describe('SPM-84 — each notice names its own event', () => {
  it('spm84_two_events_give_notices_for_each', () => {
    const other = { ...request, id: 'req-2', core: { title: 'Winter gala', preferredDateTime: START } }
    const notices = coordinatorAssignmentNotifications(other, lead, { change: 'assigned', coordinator: ada, at: AT })
    for (const notice of notices) expect(notice).toMatchObject({ eventRequestId: 'req-2', eventTitle: 'Winter gala' })
    expect(notices[0].message).toBe('“Winter gala” has been assigned to you.')
  })
})
