// SPM-84 through the API: the Lead's assignment (SPM-68) notifies the Coordinator and the owning Organiser; the
// Lead's reassignment (SPM-69) notifies the new and previous Coordinator and the owning Organiser — in the same
// transaction as the change, and never for a refused one. In-memory harness (tests/shared/helpers/cancellationApi.js:
// real HTTP and middleware, mocked token verification, fakeFirestore) — not database verification.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import {
  EVENT_ASSIGNED_TO_YOU_NOTICE,
  EVENT_COORDINATOR_ASSIGNED_NOTICE,
  EVENT_REASSIGNED_AWAY_NOTICE,
} from '../../../shared/notifications.js'
import { COORDINATOR_LEAD } from '../../../shared/permissions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const api = createCancellationApi()
beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

const { coordinator, coordinator2, coordinator3, coordinatorLead: lead, organiserA1, organiserA2, organiserA3, venueStaff } = SEED_ACCOUNTS
const SECOND_LEAD = { uid: 'spm84-second-lead', name: 'Second Lead', email: 'lead-2@spm84.test', roles: [COORDINATOR_LEAD] }
const UNASSIGNED_ID = 'seed-req-a2-unassigned'
const PLANNING_ID = 'seed-req-a1-planning'

const assign = (account, id, coordinatorUid) => api.call('POST', `/api/event-requests/${id}/assignment`, account, { coordinatorUid })
const reassign = (account, id, body) => api.call('POST', `/api/event-requests/${id}/reassignment`, account, body)
const handTo = (to, id = PLANNING_ID) => ({ coordinatorUid: to.uid, expectedCoordinatorUid: api.stored(id).assignedCoordinatorUid })
const noticeOf = async (account) => (await api.notificationsOf(account)).map(({ type, message, eventRequestId }) => ({ type, message, eventRequestId }))
const changeTransaction = (id) => api.transactions().filter((transaction) => transaction.committed && transaction.writes.includes(`eventRequests/${id}`))

describe('SPM-84 AC1 — the Lead assigns a Coordinator', () => {
  it('spm84_the_coordinator_and_the_owning_organiser_are_notified_in_the_assignment_transaction', async () => {
    const title = api.stored(UNASSIGNED_ID).core.title
    expect((await assign(lead, UNASSIGNED_ID, coordinator2.uid)).status).toBe(200)

    expect(await noticeOf(coordinator2)).toEqual([{ type: EVENT_ASSIGNED_TO_YOU_NOTICE, message: `“${title}” has been assigned to you.`, eventRequestId: UNASSIGNED_ID }])
    expect(await noticeOf(organiserA2)).toEqual([{ type: EVENT_COORDINATOR_ASSIGNED_NOTICE, message: `${coordinator2.name} is now the Event Coordinator for “${title}”.`, eventRequestId: UNASSIGNED_ID }])
    expect(api.allNotifications()).toHaveLength(2)

    const [transaction] = changeTransaction(UNASSIGNED_ID)
    expect(changeTransaction(UNASSIGNED_ID)).toHaveLength(1)
    expect(transaction.writes.filter((path) => path.startsWith('notifications/'))).toHaveLength(2)
  })

  it('spm84_the_new_coordinator_can_open_the_event_the_notice_names', async () => {
    await assign(lead, UNASSIGNED_ID, coordinator2.uid)
    const [notice] = await api.notificationsOf(coordinator2)
    expect((await api.view(coordinator2, notice.eventRequestId)).status).toBe(200)
    const [organiserNotice] = await api.notificationsOf(organiserA2)
    expect((await api.view(organiserA2, organiserNotice.eventRequestId)).status).toBe(200)
  })
})

describe('SPM-84 AC2 — the Lead reassigns the event', () => {
  it('spm84_the_new_and_previous_coordinator_and_the_owning_organiser_are_notified_in_the_reassignment_transaction', async () => {
    const title = api.stored(PLANNING_ID).core.title
    expect((await reassign(lead, PLANNING_ID, handTo(coordinator2))).status).toBe(200)

    expect(await noticeOf(coordinator2)).toEqual([{ type: EVENT_ASSIGNED_TO_YOU_NOTICE, message: `“${title}” has been reassigned to you.`, eventRequestId: PLANNING_ID }])
    expect(await noticeOf(coordinator)).toEqual([{ type: EVENT_REASSIGNED_AWAY_NOTICE, message: `“${title}” has been reassigned to ${coordinator2.name}. You no longer manage it.`, eventRequestId: PLANNING_ID }])
    expect(await noticeOf(organiserA1)).toEqual([{ type: EVENT_COORDINATOR_ASSIGNED_NOTICE, message: `${coordinator2.name} is now the Event Coordinator for “${title}”.`, eventRequestId: PLANNING_ID }])
    expect(api.allNotifications()).toHaveLength(3)

    const transactions = changeTransaction(PLANNING_ID)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].writes.filter((path) => path.startsWith('notifications/'))).toHaveLength(3)
  })

  it('spm84_the_previous_coordinator_no_longer_has_the_event_their_notice_names', async () => {
    await reassign(lead, PLANNING_ID, handTo(coordinator2))
    const [notice] = await api.notificationsOf(coordinator)
    expect((await api.view(coordinator, notice.eventRequestId)).status).toBe(404)
  })
})

describe('SPM-84 AC4 — nobody else is notified (CL3 G8!C43; owning Organiser only)', () => {
  it('spm84_not_the_acting_lead_another_lead_colleagues_or_other_staff', async () => {
    api.putDocument('users', SECOND_LEAD.uid, SECOND_LEAD)
    await assign(lead, UNASSIGNED_ID, coordinator2.uid)
    await reassign(lead, PLANNING_ID, handTo(coordinator3))

    for (const account of [lead, SECOND_LEAD, organiserA3, venueStaff]) {
      expect(await api.notificationsOf(account), account.uid).toEqual([])
    }
    // Organiser A1 owns the planning event; A2 owns the queued one. Neither hears about the other's.
    expect((await api.notificationsOf(organiserA1)).map((notice) => notice.eventRequestId)).toEqual([PLANNING_ID])
    expect((await api.notificationsOf(organiserA2)).map((notice) => notice.eventRequestId)).toEqual([UNASSIGNED_ID])
  })
})

describe('SPM-84 AC6 — only a saved assignment or reassignment notifies', () => {
  it.each([
    ['assign: already assigned (409)', () => assign(lead, 'seed-req-a1-submitted', coordinator2.uid), 409],
    ['assign: not a Coordinator (400)', () => assign(lead, UNASSIGNED_ID, venueStaff.uid), 400],
    ['assign: the Lead themselves (400)', () => assign(lead, UNASSIGNED_ID, lead.uid), 400],
    ['assign: not a Lead (403)', () => assign(coordinator, UNASSIGNED_ID, coordinator2.uid), 403],
    ['reassign: a finished event (409)', () => reassign(lead, 'seed-req-a1-completed', handTo(coordinator2, 'seed-req-a1-completed')), 409],
    ['reassign: a stale Coordinator (409)', () => reassign(lead, PLANNING_ID, { coordinatorUid: coordinator2.uid, expectedCoordinatorUid: coordinator3.uid }), 409],
    ['reassign: the current Coordinator (400)', () => reassign(lead, PLANNING_ID, handTo(coordinator)), 400],
    ['reassign: the assigned Coordinator tries (403)', () => reassign(coordinator, PLANNING_ID, handTo(coordinator2)), 403],
  ])('spm84_%s_writes_no_notice', async (_label, attempt, status) => {
    expect((await attempt()).status).toBe(status)
    expect(api.allNotifications()).toEqual([])
  })
})
