// SPM-36 — Technical Support Staff reject an equipment request. Real service code against the in-memory
// Firestore double (not the emulator, not a real project).

import { beforeEach, describe, expect, it } from 'vitest'

import {
  EquipmentRequestError,
  EquipmentRequestShortfallError,
  EquipmentRequestValidationError,
  decideEquipmentRequest,
  listAssignedEquipmentRequests,
  listEventEquipmentRequests,
} from '../../../backend/src/services/equipmentRequestService.js'
import { StatusTransitionError, transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { EQUIPMENT_REQUEST_DECIDES } from '../../../shared/arrangements.js'
import { EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_REJECTED } from '../../../shared/equipmentRequest.js'
import { EQUIPMENT_REQUEST_REJECTED_NOTICE } from '../../../shared/notifications.js'
import { APPROVE_TECHNICAL } from '../../../shared/requestActions.js'
import { SAFETY_APPROVED } from '../../../shared/safetyReview.js'
import { CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { ARRANGEMENTS_NOT_APPROVED, CONFIRM } from '../../../shared/statusTransitions.js'
import { addApprovedVenue } from '../../spm-90/approvedVenueFixture.js'
import {
  approvalFixture,
  coordinator,
  fiveProjectors,
  fulfillableInput,
  now,
  organiser,
  secondTech,
  submitAs,
  tech,
  venueStaff,
} from '../fixtures.js'

let db

const REASON = 'Only 3 projectors are available.'
const reject = (id, details = { reason: REASON }, user = tech) => decideEquipmentRequest('event', id, 'reject', user, db, now, details)
const approve = (id) => decideEquipmentRequest('event', id, 'approve', tech, db, now)
const theEvent = () => db.collectionData('eventRequests').get('event')
const stored = (id) => db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id)
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
const notifications = () => [...db.collectionData('notifications').values()]
const snapshot = () => JSON.stringify([[...db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).entries()], theEvent(), activity().length, notifications().length])

async function expectRefused(promise, status) {
  const error = await promise.catch((caught) => caught)
  expect(error).toBeInstanceOf(EquipmentRequestError)
  expect(error.status).toBe(status)
}

beforeEach(() => {
  db = approvalFixture()
  theEvent().arrangementApprovals = { venue: { decision: 'approved', byUid: 'v1', at: 'earlier' } }
})

describe('SPM-36 reject an equipment request', () => {
  it('spm36_reject_writes_status_reason_sign_off_summary_activity_and_notice_in_one_transaction', async () => {
    const created = await submitAs(db, fiveProjectors)
    const before = db.transactions.length
    const result = await reject(created.id, { reason: REASON, suggestedAlternative: 'Two projectors and the LED wall' })

    expect(result.equipmentRequest).toMatchObject({
      status: 'rejected', rejectedByName: 'Tech One', rejectedAt: now.toISOString(), rejectionReason: REASON, suggestedAlternative: 'Two projectors and the LED wall',
    })
    expect(stored(created.id)).toMatchObject({ status: 'rejected', rejectedByUid: 't1', rejectionReason: REASON })
    expect(theEvent().arrangementApprovals).toEqual({
      venue: { decision: 'approved', byUid: 'v1', at: 'earlier' },
      technical: { decision: 'rejected', byUid: 't1', at: now.toISOString() },
    })
    expect(theEvent().currentEquipmentRequest).toEqual({ id: created.id, status: 'rejected' })
    // The event stays in Planning, and nothing is reserved (no reservations collection is written).
    expect(theEvent().status).toBe(PLANNING)
    expect(db.collectionData('equipmentReservations').size).toBe(0)

    const [rejected, decided] = activity().slice(-2)
    expect(rejected).toEqual({
      type: EQUIPMENT_REQUEST_REJECTED, equipmentRequestId: created.id, at: now.toISOString(),
      actor: { type: 'user', uid: 't1', name: 'Tech One', role: 'technical_staff' },
      reason: REASON, suggestedAlternative: 'Two projectors and the LED wall',
    })
    expect(decided).toEqual({ type: 'arrangement_decided', arrangement: 'technical', decision: 'rejected', actor: { type: 'user', uid: 't1', name: 'Tech One' }, at: now.toISOString() })
    expect(notifications()).toEqual([expect.objectContaining({ recipientUid: 'c', type: EQUIPMENT_REQUEST_REJECTED_NOTICE, reason: REASON, equipmentRequestId: created.id })])

    const transactions = db.transactions.slice(before)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].committed).toBe(true)
  })

  it('spm36_five_projectors_against_three_cannot_be_approved_but_can_be_rejected', async () => {
    const created = await submitAs(db, fiveProjectors)
    await expect(approve(created.id)).rejects.toBeInstanceOf(EquipmentRequestShortfallError)
    await expect(reject(created.id)).resolves.toMatchObject({ equipmentRequest: { status: 'rejected' } })
  })

  it('spm36_a_request_that_could_be_fulfilled_may_still_be_rejected', async () => {
    const created = await submitAs(db, fulfillableInput)
    await expect(reject(created.id, { reason: 'The HDMI requirement cannot be met.' })).resolves.toMatchObject({ equipmentRequest: { status: 'rejected' } })
  })

  it.each([
    [{}, { reason: 'A reason is required.' }],
    [{ reason: '   ' }, { reason: 'A reason is required.' }],
    [{ reason: 'x'.repeat(1001) }, { reason: 'Must be 1000 characters or fewer.' }],
    [{ reason: 'ok', suggestedAlternative: 'y'.repeat(1001) }, { suggestedAlternative: 'Must be 1000 characters or fewer.' }],
  ])('spm36_invalid_rejection_%j_is_400_with_nothing_written', async (details, errors) => {
    const created = await submitAs(db, fiveProjectors)
    const before = snapshot()
    const error = await reject(created.id, details).catch((caught) => caught)
    expect(error).toBeInstanceOf(EquipmentRequestValidationError)
    expect(error.errors).toEqual(errors)
    expect(snapshot()).toBe(before)
    expect(db.transactions.at(-1)).toMatchObject({ committed: false, writes: [] })
  })

  it('spm36_refusals_403_404_409', async () => {
    const created = await submitAs(db, fiveProjectors)
    for (const user of [coordinator, organiser, venueStaff]) await expectRefused(reject(created.id, { reason: REASON }, user), 403)
    await expectRefused(reject(created.id, { reason: REASON }, secondTech), 404)
    await expectRefused(reject('missing'), 404)
    for (const status of [UNDER_REVIEW, CONFIRMED]) {
      theEvent().status = status
      await expectRefused(reject(created.id), 409)
    }
    theEvent().status = PLANNING
    for (const status of ['approved', 'rejected', 'closed']) {
      stored(created.id).status = status
      await expectRefused(reject(created.id), 409)
    }
    theEvent().assignedStaffUids = []
    stored(created.id).status = 'pending_review'
    await expectRefused(reject(created.id), 404)
  })

  it('spm36_a_permission_refusal_comes_before_the_reason_check', async () => {
    const created = await submitAs(db, fiveProjectors)
    await expectRefused(reject(created.id, {}, coordinator), 403)
  })
})

describe('SPM-36 after a rejection', () => {
  it('spm36_confirm_and_the_manual_technical_sign_off_are_refused', async () => {
    const created = await submitAs(db, fiveProjectors)
    await reject(created.id)
    const confirm = await transitionEventRequest('event', CONFIRM, coordinator, db, now).catch((caught) => caught)
    expect(confirm).toBeInstanceOf(StatusTransitionError)
    expect(confirm.reason).toBe(ARRANGEMENTS_NOT_APPROVED)
    const manual = await transitionEventRequest('event', APPROVE_TECHNICAL, tech, db, now).catch((caught) => caught)
    expect(manual.reason).toBe(EQUIPMENT_REQUEST_DECIDES)
    expect(theEvent().status).toBe(PLANNING)
  })

  it('spm36_the_coordinator_sees_the_rejection_and_may_submit_a_revision', async () => {
    const created = await submitAs(db, fiveProjectors)
    await reject(created.id, { reason: REASON, suggestedAlternative: 'Three projectors' })
    const listed = await listEventEquipmentRequests('event', coordinator, db)
    expect(listed.canSubmit).toBe(true)
    expect(listed.requests[0]).toMatchObject({ status: 'rejected', rejectedByName: 'Tech One', rejectionReason: REASON, suggestedAlternative: 'Three projectors', actions: [] })
  })

  it('spm36_a_revised_request_replaces_it_clears_the_rejected_sign_off_and_once_approved_allows_confirm', async () => {
    const rejected = await submitAs(db, fiveProjectors)
    await reject(rejected.id)

    const revised = await submitAs(db, { items: [{ equipmentTypeId: 'projector', quantity: 3 }], submissionKey: 'revised' })
    expect(revised).toMatchObject({ status: 'pending_review', replacesId: rejected.id, assignedTechnicalStaffName: 'Tech One' })
    expect(stored(rejected.id)).toMatchObject({ status: 'rejected', replacedById: revised.id })
    expect(theEvent().arrangementApprovals).toEqual({ venue: { decision: 'approved', byUid: 'v1', at: 'earlier' } })
    expect(theEvent().currentEquipmentRequest).toEqual({ id: revised.id, status: 'pending_review' })
    expect((await listEventEquipmentRequests('event', tech, db)).requests.find((request) => request.id === revised.id).actions).toEqual(['approve', 'reject'])

    await approve(revised.id)
    addApprovedVenue(db, 'event')
    // SPM-91/92: Confirm also needs a safety approval, recorded outside this story; set directly here.
    theEvent().safetyReview = { status: SAFETY_APPROVED }
    expect((await transitionEventRequest('event', CONFIRM, coordinator, db, now)).status).toBe(CONFIRMED)
  })

  it('spm36_a_rejected_request_follows_the_pending_ones_in_the_queue', async () => {
    const rejected = await submitAs(db, fiveProjectors)
    await reject(rejected.id)
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set('later-pending', {
      eventRequestId: 'other', eventTitle: 'Other', status: 'pending_review', assignedTechnicalStaffUid: 't1', items: [], createdAt: '2027-01-01T00:00:00.000Z',
    })
    const { requests } = await listAssignedEquipmentRequests(tech, db)
    expect(requests.map((request) => [request.id, request.status])).toEqual([['later-pending', 'pending_review'], [rejected.id, 'rejected']])
  })
})
