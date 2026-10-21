// SPM-17 — submitting, reading and closing equipment requests. Real service code against the in-memory
// Firestore double (not the emulator, not a real project).

import { beforeEach, describe, expect, it } from 'vitest'

import {
  EquipmentRequestError,
  EquipmentRequestValidationError,
  listEventEquipmentRequests,
  submitEquipmentRequest,
} from '../../../backend/src/services/equipmentRequestService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { BOOKINGS, submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { EQUIPMENT_REQUESTED, EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS } from '../../../shared/equipmentRequest.js'
import { REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { CONFIRMED, UNDER_REVIEW } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, CANCEL, REJECT } from '../../../shared/statusTransitions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import {
  attendee,
  coordinator,
  dualStaff,
  fixture,
  input,
  now,
  organiser,
  otherCoordinator,
  secondTech,
  tech,
  venueStaff,
} from '../fixtures.js'

let db

const submit = (body = input, user = coordinator, id = 'event') => submitEquipmentRequest(id, body, user, db, now)
const stored = () => [...db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).entries()].map(([id, data]) => ({ id, ...data }))
const theEvent = () => db.collectionData('eventRequests').get('event')
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]

async function expectRefused(promise, status, message) {
  const error = await promise.catch((caught) => caught)
  expect(error).toBeInstanceOf(EquipmentRequestError)
  expect(error.status).toBe(status)
  if (message) expect(error.message).toMatch(message)
}

function rejectStored(id) {
  db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id).status = EQUIPMENT_REQUEST_STATUS.REJECTED
}

beforeEach(() => {
  db = fixture()
})

describe('SPM-17 submit an equipment request', () => {
  it('spm17_creates_a_pending_review_request_linked_to_the_event_and_its_period', async () => {
    const created = await submit()
    expect(created).toMatchObject({
      eventRequestId: 'event',
      eventTitle: 'Conference',
      status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW,
      requiredPeriod: { startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z' },
      items: [
        { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, technicalRequirements: 'HDMI to the lectern' },
        { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', quantity: 4, technicalRequirements: null },
      ],
      assignedTechnicalStaffName: 'Tech One',
      replacesId: null,
      createdAt: now.toISOString(),
    })
    // The submission reference and assignee uid are stored but not returned.
    expect(created).not.toHaveProperty('submissionKey')
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).toMatchObject({ assignedTechnicalStaffUid: 't1', submissionKey: 'attempt-1', createdByUid: 'c' })
  })

  it('spm17_assigns_technical_staff_records_activity_and_writes_one_transaction', async () => {
    const created = await submit()
    expect(theEvent().assignedStaffUids).toEqual(['t1'])
    expect(activity()).toEqual([
      expect.objectContaining({ type: EQUIPMENT_REQUESTED, equipmentRequestId: created.id, replacesId: null, assignedTechnicalStaffUid: 't1', at: now.toISOString() }),
    ])
    expect(db.collectionData('systemLocks').get('technicalStaffAssignment')).toEqual({ lastUid: 't1', updatedAt: now.toISOString() })
    const committed = db.transactions.filter((transaction) => transaction.committed)
    expect(committed).toHaveLength(1)
    expect(committed[0].writes).toEqual(expect.arrayContaining([
      `${EQUIPMENT_REQUESTS_COLLECTION}/${created.id}`, 'systemLocks/technicalStaffAssignment', 'eventRequests/event',
    ]))
  })

  it.each([UNDER_REVIEW, CONFIRMED])('spm17_refused_at_%s_with_nothing_written', async (status) => {
    theEvent().status = status
    await expectRefused(submit(), 409, /Planning/)
    expect(stored()).toEqual([])
  })

  it('spm17_a_user_without_the_coordinator_role_gets_403', async () => {
    for (const user of [organiser, tech, venueStaff, attendee]) await expectRefused(submit(input, user), 403)
    expect(stored()).toEqual([])
  })

  it('spm17_a_coordinator_not_assigned_to_the_event_gets_404', async () => {
    await expectRefused(submit(input, otherCoordinator), 404, 'Event not found.')
    await expectRefused(submit(input, coordinator, 'missing'), 404, 'Event not found.')
    expect(stored()).toEqual([])
  })

  it('spm17_validation_errors_are_400_naming_each_field', async () => {
    const error = await submit({ submissionKey: 'k', items: [{ equipmentTypeId: 'projector', quantity: 0 }, { quantity: 1 }] }).catch((caught) => caught)
    expect(error).toBeInstanceOf(EquipmentRequestValidationError)
    expect(error.errors).toEqual({ 'items.0.quantity': 'Enter a whole number of 1 or more.', 'items.1.equipmentTypeId': 'Choose an equipment type.' })
    expect(stored()).toEqual([])
  })

  it('spm17_an_unknown_equipment_type_is_refused_on_its_row', async () => {
    const error = await submit({ submissionKey: 'k', items: [{ equipmentTypeId: 'projector', quantity: 1 }, { equipmentTypeId: 'laser', quantity: 1 }] }).catch((caught) => caught)
    expect(error).toBeInstanceOf(EquipmentRequestValidationError)
    expect(error.errors).toEqual({ 'items.1.equipmentTypeId': 'Choose an equipment type from the catalogue.' })
    expect(stored()).toEqual([])
  })

  it('spm17_a_second_request_while_one_is_pending_review_is_refused', async () => {
    await submit()
    await expectRefused(submit({ ...input, submissionKey: 'attempt-2' }), 409, /waiting for review/)
    expect(stored()).toHaveLength(1)
  })

  it('spm17_an_event_without_a_usable_date_cannot_request_equipment', async () => {
    theEvent().core.durationHours = null
    await expectRefused(submit(), 409, /date, time and duration/)
  })

  it('spm17_a_repeated_submit_returns_the_same_request', async () => {
    const first = await submit()
    const again = await submit()
    expect(again).toEqual(first)
    expect(stored()).toHaveLength(1)
    await expectRefused(submit({ ...input, items: [{ equipmentTypeId: 'mic', quantity: 9 }] }), 409, /submission reference/)
  })

  it('spm17_after_a_rejection_the_new_request_replaces_it_and_keeps_the_assignee', async () => {
    const first = await submit()
    rejectStored(first.id)
    // Another staff member is now on the event too; the earlier request's assignee is still preferred.
    theEvent().assignedStaffUids = ['t2', 't1']
    const revised = await submit({ ...input, submissionKey: 'attempt-2' })
    expect(revised).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, replacesId: first.id, assignedTechnicalStaffName: 'Tech One' })
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(first.id)).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.REJECTED, replacedById: revised.id })
    expect(activity().at(-1)).toMatchObject({ replacesId: first.id })
  })

  it('spm17_a_new_request_after_a_reserved_one_has_no_replacesId', async () => {
    const first = await submit()
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(first.id).status = EQUIPMENT_REQUEST_STATUS.RESERVED
    const next = await submit({ ...input, submissionKey: 'attempt-2' })
    expect(next.replacesId).toBeNull()
  })
})

describe('SPM-17 which Technical Support Staff member is assigned', () => {
  it('spm17_reuses_a_technical_only_member_already_on_the_event_without_the_rotation', async () => {
    theEvent().assignedStaffUids = ['v1', 't2']
    const created = await submit()
    expect(created.assignedTechnicalStaffName).toBe('Tech Two')
    expect(theEvent().assignedStaffUids).toEqual(['v1', 't2'])
    expect(db.collectionData('systemLocks').has('technicalStaffAssignment')).toBe(false)
  })

  it('spm17_reuses_a_member_holding_both_roles_when_no_technical_only_member_is_assigned', async () => {
    db = fixture({ users: [coordinator, tech, dualStaff] })
    theEvent().assignedStaffUids = ['d1']
    expect((await submit()).assignedTechnicalStaffName).toBe('Dual One')
  })

  it('spm17_prefers_a_technical_only_member_to_one_holding_both_roles', async () => {
    db = fixture({ users: [coordinator, tech, dualStaff] })
    theEvent().assignedStaffUids = ['d1', 't1']
    expect((await submit()).assignedTechnicalStaffName).toBe('Tech One')
  })

  it('spm17_otherwise_chooses_the_fewest_pending_and_rotates', async () => {
    await submit()
    const other = await submitEquipmentRequest('other', { ...input, submissionKey: 'other-1' }, otherCoordinator, db, now)
    expect(other.assignedTechnicalStaffName).toBe('Tech Two')
  })

  it('spm17_no_technical_staff_account_means_nothing_is_written', async () => {
    db = fixture({ users: [coordinator, venueStaff] })
    await expectRefused(submit(), 409, /No Technical Support Staff/)
    expect(stored()).toEqual([])
    expect(theEvent().assignedStaffUids).toEqual([])
  })
})

describe('SPM-17 reading equipment requests', () => {
  it('spm17_the_coordinator_reads_the_list_and_may_submit_until_one_is_pending', async () => {
    expect(await listEventEquipmentRequests('event', coordinator, db)).toEqual({ canSubmit: true, requests: [] })
    const created = await submit()
    const listed = await listEventEquipmentRequests('event', coordinator, db)
    expect(listed.canSubmit).toBe(false)
    // SPM-56 added `actions` to each listed request: the Coordinator has none.
    expect(listed.requests).toEqual([{ ...created, actions: [] }])
  })

  it('spm17_the_assigned_technical_staff_member_can_read_it', async () => {
    const created = await submit()
    // SPM-56 added `actions`: the assignee may approve (and, since SPM-36, reject) a Pending Review request.
    expect((await listEventEquipmentRequests('event', tech, db))).toEqual({ canSubmit: false, requests: [{ ...created, actions: ['approve', 'reject'] }] })
  })

  it('spm17_organisers_venue_staff_attendees_and_other_staff_cannot', async () => {
    await submit()
    theEvent().assignedStaffUids = ['t1', 't2', 'v1']
    for (const user of [organiser, venueStaff, attendee, secondTech, otherCoordinator]) {
      await expectRefused(listEventEquipmentRequests('event', user, db), 404, 'Event not found.')
    }
  })

  it('spm17_requests_follow_the_event_when_its_coordinator_is_reassigned', async () => {
    const created = await submit()
    theEvent().assignedCoordinatorUid = 'c2'
    expect((await listEventEquipmentRequests('event', otherCoordinator, db)).requests).toEqual([{ ...created, actions: [] }])
    await expectRefused(listEventEquipmentRequests('event', coordinator, db), 404)
  })
})

describe('SPM-17 closing on event rejection or cancellation', () => {
  async function pendingAndRejected() {
    const rejected = await submit({ ...input, submissionKey: 'attempt-0' })
    rejectStored(rejected.id)
    const pending = await submit()
    return { rejected, pending }
  }

  it.each([
    [REJECT, 'event_rejected'],
    [CANCEL, 'event_cancelled'],
    [APPROVE_CANCELLATION, 'event_cancelled'],
  ])('spm17_%s_closes_pending_review_requests', async (action, closedReason) => {
    const { rejected, pending } = await pendingAndRejected()
    if (action !== REJECT) theEvent().status = CONFIRMED
    if (action === APPROVE_CANCELLATION) await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    await transitionEventRequest('event', action, coordinator, db, now, { reason: 'Unable to proceed' })

    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(pending.id)).toMatchObject({
      status: EQUIPMENT_REQUEST_STATUS.CLOSED, closedReason, closedByUid: 'c', closedAt: now.toISOString(),
    })
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(rejected.id).status).toBe(EQUIPMENT_REQUEST_STATUS.REJECTED)
  })

  it('spm17_a_cancellation_request_alone_closes_nothing', async () => {
    const pending = await submit()
    theEvent().status = CONFIRMED
    await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(pending.id).status).toBe(EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW)
  })

  it('spm17_rejection_releases_spm14_holds_and_closes_equipment_requests_in_one_transaction', async () => {
    await db.collection('venues').doc('hall').set({ name: 'Hall', maximumCapacity: 200, setupMinutes: 0, turnaroundMinutes: 0 })
    await submitVenueBooking('event', {
      venueId: 'hall', startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', attendeeCount: 40, requirements: 'Theatre', submissionKey: 'venue-1',
    }, coordinator, db, now)
    const pending = await submit()
    const before = db.transactions.length
    await transitionEventRequest('event', REJECT, coordinator, db, now, { reason: 'Unable to proceed' })

    const transition = db.transactions.slice(before)
    expect(transition).toHaveLength(1)
    expect(transition[0].committed).toBe(true)
    const holds = [...db.collectionData('venueAvailability').values()].filter((entry) => entry.status === AVAILABILITY_STATUS.TENTATIVE_HOLD)
    expect(holds.map((hold) => hold.lifecycleStatus)).toEqual(['removed'])
    expect([...db.collectionData(BOOKINGS).values()].map((entry) => entry.status)).toEqual(['cancelled'])
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(pending.id).status).toBe(EQUIPMENT_REQUEST_STATUS.CLOSED)
  })
})
