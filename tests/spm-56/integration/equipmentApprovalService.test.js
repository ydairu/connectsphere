// SPM-56 — Technical Support Staff approve an equipment request. Real service code against the in-memory
// Firestore double (not the emulator, not a real project). The re-confirm case makes the SPM-10 significant
// change through the real PATCH /api/requests/:id route, using the E2E double's store on the same database.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { checkEquipmentRequestAvailability } from '../../../backend/src/services/equipmentAvailabilityService.js'
import {
  EquipmentRequestError,
  EquipmentRequestShortfallError,
  decideEquipmentRequest,
  listAssignedEquipmentRequests,
  listEventEquipmentRequests,
} from '../../../backend/src/services/equipmentRequestService.js'
import { StatusTransitionError, transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { EQUIPMENT_REQUEST_DECIDES } from '../../../shared/arrangements.js'
import { EQUIPMENT_UNIT_STATUS } from '../../../shared/equipment.js'
import {
  APPROVE_EQUIPMENT_REQUEST,
  EQUIPMENT_REQUESTS_COLLECTION,
  EQUIPMENT_REQUEST_APPROVAL_RECONFIRMED,
  EQUIPMENT_REQUEST_APPROVED,
  EQUIPMENT_REQUEST_STATUS,
  RECONFIRM_EQUIPMENT_APPROVAL,
} from '../../../shared/equipmentRequest.js'
import { EQUIPMENT_REQUEST_APPROVED_NOTICE } from '../../../shared/notifications.js'
import { APPROVE_TECHNICAL, REJECT_TECHNICAL } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { CANCEL, CONFIRM, REJECT } from '../../../shared/statusTransitions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import {
  approvalFixture,
  coordinator,
  fulfillableInput,
  now,
  organiser,
  secondTech,
  shortInput,
  submitAs,
  tech,
  venueStaff,
} from '../fixtures.js'

let db

const approve = (id, user = tech, action = APPROVE_EQUIPMENT_REQUEST) => decideEquipmentRequest('event', id, action, user, db, now)
const theEvent = () => db.collectionData('eventRequests').get('event')
const stored = (id) => db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id)
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
const notifications = () => [...db.collectionData('notifications').values()]

async function expectRefused(promise, status, message) {
  const error = await promise.catch((caught) => caught)
  expect(error).toBeInstanceOf(EquipmentRequestError)
  expect(error.status).toBe(status)
  if (message) expect(error.message).toMatch(message)
  return error
}

function snapshot() {
  return {
    requests: JSON.stringify([...db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).entries()]),
    event: JSON.stringify(theEvent()),
    activity: activity().length,
    notifications: notifications().length,
  }
}

beforeEach(() => {
  db = approvalFixture()
})

describe('SPM-56 approve an equipment request', () => {
  it('spm56_approve_writes_status_sign_off_summary_activity_and_notice_in_one_transaction', async () => {
    const created = await submitAs(db)
    theEvent().arrangementApprovals = { venue: { decision: 'approved', byUid: 'v1', at: 'earlier' } }
    const before = db.transactions.length

    const result = await approve(created.id)

    expect(result.equipmentRequest).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.APPROVED, approvedByName: 'Tech One', approvedAt: now.toISOString() })
    expect(result.availability.fulfillable).toBe(true)
    expect(stored(created.id)).toMatchObject({ status: 'approved', approvedByUid: 't1', approvedByName: 'Tech One', approvedAt: now.toISOString() })
    expect(theEvent().arrangementApprovals).toEqual({
      venue: { decision: 'approved', byUid: 'v1', at: 'earlier' },
      technical: { decision: 'approved', byUid: 't1', at: now.toISOString() },
    })
    expect(theEvent().currentEquipmentRequest).toEqual({ id: created.id, status: 'approved' })

    const entries = activity().slice(-2)
    expect(entries[0]).toMatchObject({
      type: EQUIPMENT_REQUEST_APPROVED,
      equipmentRequestId: created.id,
      actor: { type: 'user', uid: 't1', name: 'Tech One', role: 'technical_staff' },
      at: now.toISOString(),
      availability: { fulfillable: true, items: [{ equipmentTypeId: 'projector', requestedQuantity: 2, availableQuantity: 3 }, { equipmentTypeId: 'mic', requestedQuantity: 2, availableQuantity: 2 }] },
    })
    expect(entries[1]).toEqual({ type: 'arrangement_decided', arrangement: 'technical', decision: 'approved', actor: { type: 'user', uid: 't1', name: 'Tech One' }, at: now.toISOString() })
    expect(notifications()).toEqual([expect.objectContaining({ recipientUid: 'c', type: EQUIPMENT_REQUEST_APPROVED_NOTICE, equipmentRequestId: created.id, eventRequestId: 'event' })])

    const transactions = db.transactions.slice(before)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].committed).toBe(true)
    expect(transactions[0].reads).toEqual(expect.arrayContaining(['eventRequests/event', `${EQUIPMENT_REQUESTS_COLLECTION}/${created.id}`, 'equipmentUnits']))
    expect(transactions[0].writes).toEqual(expect.arrayContaining([`${EQUIPMENT_REQUESTS_COLLECTION}/${created.id}`, 'eventRequests/event']))
  })

  it('spm56_a_short_request_is_refused_with_the_shortfall_and_nothing_written', async () => {
    const created = await submitAs(db, shortInput)
    const before = snapshot()
    const error = await approve(created.id).catch((caught) => caught)

    expect(error).toBeInstanceOf(EquipmentRequestShortfallError)
    expect(error.status).toBe(409)
    expect(error.availability.fulfillable).toBe(false)
    expect(error.availability.items.map(({ equipmentTypeId, availableQuantity, shortfall }) => [equipmentTypeId, availableQuantity, shortfall])).toEqual([['projector', 3, 1], ['mic', 2, 0]])
    expect(snapshot()).toEqual(before)
    expect(db.transactions.at(-1)).toMatchObject({ committed: false, writes: [] })
  })

  it('spm56_a_unit_damaged_after_the_check_is_caught_by_the_approval_s_own_check', async () => {
    const created = await submitAs(db, { ...fulfillableInput, items: [{ equipmentTypeId: 'projector', quantity: 3 }] })
    expect((await checkEquipmentRequestAvailability('event', created.id, tech, db, now)).fulfillable).toBe(true)
    db.collectionData('equipmentUnits').get('proj-1').status = EQUIPMENT_UNIT_STATUS.DAMAGED
    await expect(approve(created.id)).rejects.toBeInstanceOf(EquipmentRequestShortfallError)
    expect(stored(created.id).status).toBe('pending_review')
  })

  it('spm56_other_technical_staff_and_a_removed_assignee_get_404_other_roles_403', async () => {
    const created = await submitAs(db)
    await expectRefused(approve(created.id, secondTech), 404, 'Equipment request not found.')
    await expectRefused(approve('missing'), 404)
    for (const user of [coordinator, organiser, venueStaff]) await expectRefused(approve(created.id, user), 403)
    theEvent().assignedStaffUids = []
    await expectRefused(approve(created.id), 404)
    expect(stored(created.id).status).toBe('pending_review')
  })

  it.each([UNDER_REVIEW, CONFIRMED])('spm56_event_at_%s_cannot_approve', async (status) => {
    const created = await submitAs(db)
    theEvent().status = status
    await expectRefused(approve(created.id), 409, /Planning/)
  })

  it.each(['approved', 'reserved', 'rejected', 'closed'])('spm56_a_%s_request_cannot_be_approved', async (status) => {
    const created = await submitAs(db)
    stored(created.id).status = status
    await expectRefused(approve(created.id), 409)
  })

  it('spm56_an_unknown_action_is_400', async () => {
    const created = await submitAs(db)
    await expectRefused(approve(created.id, tech, 'reject'), 400)
  })

  it('spm56_the_coordinator_sees_approved_with_who_and_when', async () => {
    const created = await submitAs(db)
    await approve(created.id)
    const [listed] = (await listEventEquipmentRequests('event', coordinator, db)).requests
    expect(listed).toMatchObject({ status: 'approved', approvedByName: 'Tech One', approvedAt: now.toISOString(), actions: [] })
  })
})

describe('SPM-56 re-confirm after a significant change cleared the sign-off', () => {
  function app() {
    const authenticate = createAuthenticate({
      verifyIdToken: async (token) => ({ uid: token.slice(5) }),
      loadProfile: async (uid) => {
        const profile = db.collectionData('users').get(uid)
        return profile ? { uid, ...profile } : null
      },
    })
    return createApp({ authenticate, eventRequestStore: createFakeFirestoreEventRequestStore(() => db), getEventRequestDb: () => db, getUserDb: () => db })
  }

  it('spm56_reconfirm_restores_the_sign_off_with_a_fresh_check_and_confirm_is_then_allowed', async () => {
    const created = await submitAs(db)
    theEvent().arrangementApprovals = { venue: { decision: 'approved', byUid: 'v1', at: 'earlier' } }
    await approve(created.id)

    // SPM-10, through the real route: a significant change at Planning clears both sign-offs.
    const patched = await request(app()).patch('/api/requests/event').set('Authorization', 'Bearer test:c').send({ core: { expectedAttendees: 150 } })
    expect(patched.status).toBe(200)
    expect(theEvent().arrangementApprovals).toEqual({})
    expect(stored(created.id).status).toBe('approved')
    expect((await listEventEquipmentRequests('event', tech, db)).requests[0].actions).toEqual([RECONFIRM_EQUIPMENT_APPROVAL])

    // The venue sign-off is re-approved by Venue Staff (SPM-9, outside this story); set directly here.
    theEvent().arrangementApprovals.venue = { decision: 'approved', byUid: 'v1', at: 'again' }
    const result = await approve(created.id, tech, RECONFIRM_EQUIPMENT_APPROVAL)
    expect(result.equipmentRequest).toMatchObject({ status: 'approved', reconfirmedByName: 'Tech One', reconfirmedAt: now.toISOString() })
    expect(theEvent().arrangementApprovals.technical).toEqual({ decision: 'approved', byUid: 't1', at: now.toISOString() })
    expect(activity().some((entry) => entry.type === EQUIPMENT_REQUEST_APPROVAL_RECONFIRMED)).toBe(true)
    expect(notifications().filter((notice) => notice.type === EQUIPMENT_REQUEST_APPROVED_NOTICE).at(-1).message).toMatch(/re-confirmed/)

    const confirmed = await transitionEventRequest('event', CONFIRM, coordinator, db, now)
    expect(confirmed.status).toBe(CONFIRMED)
  })

  it('spm56_reconfirm_is_refused_while_the_sign_off_is_approved', async () => {
    const created = await submitAs(db)
    await approve(created.id)
    await expectRefused(approve(created.id, tech, RECONFIRM_EQUIPMENT_APPROVAL), 409, /nothing to re-confirm/)
  })
})

describe('SPM-56 the manual technical sign-off', () => {
  it('spm56_approve_and_reject_technical_are_refused_while_a_request_is_current', async () => {
    await submitAs(db)
    for (const action of [APPROVE_TECHNICAL, REJECT_TECHNICAL]) {
      const error = await transitionEventRequest('event', action, tech, db, now).catch((caught) => caught)
      expect(error).toBeInstanceOf(StatusTransitionError)
      expect(error.reason).toBe(EQUIPMENT_REQUEST_DECIDES)
    }
    expect(theEvent().arrangementApprovals?.technical).toBeUndefined()
  })

  it('spm56_without_an_equipment_request_the_old_sign_off_and_confirm_path_is_unchanged', async () => {
    Object.assign(theEvent(), { assignedStaffUids: ['t1', 'v1'], arrangementApprovals: { venue: { decision: 'approved', byUid: 'v1', at: 'x' } } })
    await transitionEventRequest('event', APPROVE_TECHNICAL, tech, db, now)
    expect(theEvent().arrangementApprovals.technical).toMatchObject({ decision: 'approved', byUid: 't1' })
    expect((await transitionEventRequest('event', CONFIRM, coordinator, db, now)).status).toBe(CONFIRMED)
  })
})

describe('SPM-56 SPM-17 keeps the event summary in step', () => {
  it('spm56_submit_writes_the_summary', async () => {
    const created = await submitAs(db)
    expect(theEvent().currentEquipmentRequest).toEqual({ id: created.id, status: 'pending_review' })
  })

  it.each([[REJECT, 'event_rejected'], [CANCEL, 'event_cancelled']])('spm56_%s_closes_an_approved_request_and_the_summary', async (action, closedReason) => {
    const created = await submitAs(db)
    await approve(created.id)
    if (action === CANCEL) theEvent().status = CONFIRMED
    await transitionEventRequest('event', action, coordinator, db, now, { reason: 'Unable to proceed' })
    expect(stored(created.id)).toMatchObject({ status: 'closed', closedReason })
    expect(theEvent().currentEquipmentRequest).toEqual({ id: created.id, status: 'closed' })
  })

  it('spm56_a_new_request_while_one_is_approved_is_refused', async () => {
    const created = await submitAs(db)
    await approve(created.id)
    await expectRefused(submitAs(db, { ...fulfillableInput, submissionKey: 'second' }), 409, /already has an approved/)
  })

  it('spm56_a_new_request_after_a_reserved_one_clears_the_stale_technical_sign_off', async () => {
    const created = await submitAs(db)
    theEvent().arrangementApprovals = { venue: { decision: 'approved', byUid: 'v1', at: 'x' } }
    await approve(created.id)
    stored(created.id).status = EQUIPMENT_REQUEST_STATUS.RESERVED
    const next = await submitAs(db, { ...fulfillableInput, submissionKey: 'second' })
    expect(theEvent().arrangementApprovals).toEqual({ venue: { decision: 'approved', byUid: 'v1', at: 'x' } })
    expect(theEvent().currentEquipmentRequest).toEqual({ id: next.id, status: 'pending_review' })
    // Confirm now waits for the new request to be approved.
    await expect(transitionEventRequest('event', CONFIRM, coordinator, db, now)).rejects.toBeInstanceOf(StatusTransitionError)
  })

  it('spm56_a_first_request_leaves_the_venue_sign_off_alone', async () => {
    theEvent().arrangementApprovals = { venue: { decision: 'approved', byUid: 'v1', at: 'x' } }
    await submitAs(db)
    expect(theEvent().arrangementApprovals).toEqual({ venue: { decision: 'approved', byUid: 'v1', at: 'x' } })
    expect(theEvent().status).toBe(PLANNING)
  })
})

describe('SPM-56 Technical Support queue', () => {
  it('spm56_queue_lists_only_my_requests_pending_first_oldest_first', async () => {
    const approved = await submitAs(db)
    await approve(approved.id)
    // An older pending request on another event, assigned to me, and one assigned to someone else.
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set('old-pending', { eventRequestId: 'other', eventTitle: 'Other', status: 'pending_review', assignedTechnicalStaffUid: 't1', items: [{ equipmentTypeName: 'Projector', quantity: 1, equipmentTypeId: 'projector' }], createdAt: '2026-01-01T00:00:00.000Z', submissionKey: 'secret' })
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set('not-mine', { eventRequestId: 'other', status: 'pending_review', assignedTechnicalStaffUid: 't2', items: [], createdAt: '2025-01-01T00:00:00.000Z' })

    const { requests } = await listAssignedEquipmentRequests(tech, db)
    expect(requests.map((entry) => [entry.id, entry.status])).toEqual([['old-pending', 'pending_review'], [approved.id, 'approved']])
    expect(requests[0]).toEqual({
      id: 'old-pending', eventRequestId: 'other', eventTitle: 'Other', status: 'pending_review', createdAt: '2026-01-01T00:00:00.000Z',
      items: [{ equipmentTypeName: 'Projector', quantity: 1 }],
    })
    expect(requests[1]).toMatchObject({ approvedAt: now.toISOString() })
  })

  it('spm56_queue_is_technical_staff_only', async () => {
    for (const user of [coordinator, venueStaff, organiser]) await expectRefused(listAssignedEquipmentRequests(user, db), 403)
  })
})
