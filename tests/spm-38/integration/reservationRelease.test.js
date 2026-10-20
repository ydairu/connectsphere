// SPM-38 — reserved equipment is released back to the available pool when the event is cancelled or rejected.
// The release itself was built with SPM-62 (prepareReservationRelease, called from prepareEquipmentRequestClose
// in the status transaction); these tests check each SPM-38 criterion through the real services, on the
// in-memory Firestore double (no transaction retries). Not database verification.

import { beforeEach, describe, expect, it } from 'vitest'

import { checkEquipmentRequestAvailability } from '../../../backend/src/services/equipmentAvailabilityService.js'
import { decideEquipmentRequest, submitEquipmentRequest } from '../../../backend/src/services/equipmentRequestService.js'
import { listVisibleReservations } from '../../../backend/src/services/equipmentReservationService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { rejectVenueBooking, submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { APPROVE_EQUIPMENT_REQUEST, EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS, RESERVE_EQUIPMENT } from '../../../shared/equipmentRequest.js'
import { EQUIPMENT_RESERVATIONS_COLLECTION, RELEASE_REASON_LABELS, RESERVATION_STATUS } from '../../../shared/equipmentReservation.js'
import { REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { CANCELLED, CONFIRMED, REJECTED } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, CANCEL, REJECT } from '../../../shared/statusTransitions.js'
import { approvalFixture, coordinator, now, organiser, otherCoordinator, secondTech, tech, venueStaff } from '../../spm-56/fixtures.js'

let db

beforeEach(() => {
  // SPM-56's fixture ('event' and 'other' at the same period, 3 Available projectors) plus SPM-14's venues.
  db = approvalFixture()
  db.collectionData('venues').set('hall', { name: 'Hall', maximumCapacity: 50, setupMinutes: 30, turnaroundMinutes: 45 })
  db.collectionData('venues').set('room', { name: 'Room', maximumCapacity: 200, setupMinutes: 0, turnaroundMinutes: 0 })
})

const assigneeOf = (id) => [tech, secondTech].find((staff) => staff.uid === db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id).assignedTechnicalStaffUid)
const reservations = (eventId = 'event') => [...db.collectionData(EQUIPMENT_RESERVATIONS_COLLECTION).values()].filter((reservation) => reservation.eventRequestId === eventId)
const event = (id = 'event') => db.collectionData('eventRequests').get(id)
const setStatus = (status, id = 'event') => db.collectionData('eventRequests').set(id, { ...event(id), status })

// Submit, approve and reserve `quantity` projectors for an event through the real services.
async function reserve(eventId, user, quantity, key) {
  const request = await submitEquipmentRequest(eventId, { items: [{ equipmentTypeId: 'projector', quantity }], submissionKey: key }, user, db, now)
  const assignee = assigneeOf(request.id)
  await decideEquipmentRequest(eventId, request.id, APPROVE_EQUIPMENT_REQUEST, assignee, db, now)
  await decideEquipmentRequest(eventId, request.id, RESERVE_EQUIPMENT, assignee, db, now)
  return { id: request.id, assignee }
}

// The overlapping event 'other' asks for all 3 projectors; its assignee checks availability.
async function otherEventAvailability() {
  const request = await submitEquipmentRequest('other', { items: [{ equipmentTypeId: 'projector', quantity: 3 }], submissionKey: 'other-check' }, otherCoordinator, db, now)
  return (await checkEquipmentRequestAvailability('other', request.id, assigneeOf(request.id), db, now)).items[0].availableQuantity
}

describe('SPM-38 — released automatically when the event is cancelled or rejected', () => {
  it('spm38_rejecting_the_event_releases_all_its_reserved_equipment', async () => {
    await reserve('event', coordinator, 2, 'reject')
    expect(reservations().map((reservation) => reservation.status)).toEqual([RESERVATION_STATUS.ACTIVE])

    await transitionEventRequest('event', REJECT, coordinator, db, now, { reason: 'Venue unavailable' })

    expect(event().status).toBe(REJECTED)
    expect(reservations()).toEqual([expect.objectContaining({ status: RESERVATION_STATUS.RELEASED, releasedReason: 'event_rejected', releasedAt: now.toISOString() })])
    expect(event().reservedEquipment).toBeNull()
  })

  it('spm38_the_coordinator_cancelling_a_confirmed_event_releases_its_reserved_equipment', async () => {
    await reserve('event', coordinator, 2, 'cancel')
    setStatus(CONFIRMED)

    await transitionEventRequest('event', CANCEL, coordinator, db, now, { reason: 'Speaker withdrew' })

    expect(event().status).toBe(CANCELLED)
    expect(reservations()).toEqual([expect.objectContaining({ status: RESERVATION_STATUS.RELEASED, releasedReason: 'event_cancelled' })])
  })

  it('spm38_approving_the_organisers_cancellation_request_releases_its_reserved_equipment', async () => {
    await reserve('event', coordinator, 2, 'approve-cancel')
    setStatus(CONFIRMED)
    await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Budget cut' })
    expect(reservations()[0].status, 'still reserved while the request is open').toBe(RESERVATION_STATUS.ACTIVE)

    await transitionEventRequest('event', APPROVE_CANCELLATION, coordinator, db, now)

    expect(event().status).toBe(CANCELLED)
    expect(reservations()).toEqual([expect.objectContaining({ status: RESERVATION_STATUS.RELEASED, releasedReason: 'event_cancelled' })])
  })

  it('spm38_every_reservation_of_the_event_is_released_and_its_request_closed', async () => {
    const reserved = await submitEquipmentRequest('event', { items: [{ equipmentTypeId: 'projector', quantity: 2 }, { equipmentTypeId: 'mic', quantity: 1 }], submissionKey: 'two-types' }, coordinator, db, now)
    const assignee = assigneeOf(reserved.id)
    await decideEquipmentRequest('event', reserved.id, APPROVE_EQUIPMENT_REQUEST, assignee, db, now)
    await decideEquipmentRequest('event', reserved.id, RESERVE_EQUIPMENT, assignee, db, now)
    expect(reservations()).toHaveLength(2)

    await transitionEventRequest('event', REJECT, coordinator, db, now, { reason: 'No venue' })

    expect(reservations().every((reservation) => reservation.status === RESERVATION_STATUS.RELEASED)).toBe(true)
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(reserved.id).status).toBe(EQUIPMENT_REQUEST_STATUS.CLOSED)
  })
})

describe('SPM-38 — released units are available again', () => {
  it('spm38_released_units_count_as_available_for_another_event_in_the_same_period', async () => {
    await reserve('event', coordinator, 3, 'all-three')
    expect(await otherEventAvailability()).toBe(0)

    setStatus(CONFIRMED)
    await transitionEventRequest('event', CANCEL, coordinator, db, now, { reason: 'Cancelled' })

    expect(await otherEventAvailability()).toBe(3)
  })
})

describe('SPM-38 — the released record', () => {
  it('spm38_the_record_shows_released_the_release_time_and_whether_the_event_was_cancelled_or_rejected', async () => {
    const { assignee } = await reserve('event', coordinator, 1, 'record')
    setStatus(CONFIRMED)
    await transitionEventRequest('event', CANCEL, coordinator, db, now, { reason: 'Cancelled' })

    const { reservations: listed } = await listVisibleReservations(assignee, { status: RESERVATION_STATUS.RELEASED }, db)

    expect(listed).toEqual([expect.objectContaining({ eventRequestId: 'event', eventStatus: CANCELLED, status: RESERVATION_STATUS.RELEASED, releasedAt: now.toISOString(), releasedReason: 'event_cancelled' })])
    expect(RELEASE_REASON_LABELS[listed[0].releasedReason]).toBe('Event cancelled')
    expect(RELEASE_REASON_LABELS.event_rejected).toBe('Event rejected')
  })
})

describe('SPM-38 — a venue booking change does not release equipment', () => {
  it('spm38_rejecting_or_replacing_one_venue_booking_leaves_the_events_reservations_active', async () => {
    await reserve('event', coordinator, 2, 'venue')
    const first = await submitVenueBooking('event', { venueId: 'hall', startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', requirements: 'Theatre', submissionKey: 'hall-1' }, coordinator, db, now)

    await rejectVenueBooking('event', first.id, { action: 'reject', reason: 'Hall unavailable' }, venueStaff, db, now)
    expect(reservations().map((reservation) => reservation.status), 'after one booking is rejected').toEqual([RESERVATION_STATUS.ACTIVE])

    await submitVenueBooking('event', { venueId: 'room', startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', requirements: 'Theatre', submissionKey: 'room-1', replacesId: first.id }, coordinator, db, now)
    expect(reservations().map((reservation) => reservation.status), 'after it is replaced').toEqual([RESERVATION_STATUS.ACTIVE])
    expect(event().reservedEquipment.items).toHaveLength(1)
  })
})
