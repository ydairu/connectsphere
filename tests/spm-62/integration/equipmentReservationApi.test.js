// SPM-62 (with SPM-57) — reserving an approved equipment request through POST
// /api/requests/:id/equipment-requests/:requestId/actions, and what the reservation changes elsewhere: the
// Organiser's view, equipment preparation, availability for overlapping events, significant changes and event
// rejection. Real Express routing and middleware, mocked token verification, the in-memory Firestore double
// (which does not model concurrent transaction retries). Not database verification.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { EQUIPMENT_RESERVATIONS_COLLECTION, EQUIPMENT_RESERVED, EQUIPMENT_RESERVATION_RELEASED, RESERVATION_STATUS } from '../../../shared/equipmentReservation.js'
import { EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS } from '../../../shared/equipmentRequest.js'
import { PREPARATION_EQUIPMENT_NOT_RESERVED } from '../../../shared/preparation.js'
import { REJECTED } from '../../../shared/status.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { approvalFixture, coordinator, organiser, otherCoordinator, secondTech, tech, venueStaff } from '../../spm-56/fixtures.js'

let db
let app

beforeEach(() => {
  db = approvalFixture()
  // 'event' and 'other' share the same period (SPM-17 fixture); 'other' belongs to otherCoordinator.
  const authenticate = createAuthenticate({
    verifyIdToken: async (token) => {
      if (!token.startsWith('test:')) throw new Error('Invalid token')
      return { uid: token.slice(5) }
    },
    loadProfile: async (uid) => {
      const profile = db.collectionData('users').get(uid)
      return profile ? { uid, ...profile } : null
    },
  })
  app = createApp({
    authenticate,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db),
    getEventRequestDb: () => db,
    getEquipmentDb: () => db,
  })
})

const auth = (user) => `Bearer test:${user.uid}`
const submit = (items, { eventId = 'event', user = coordinator } = {}) =>
  request(app).post(`/api/requests/${eventId}/equipment-requests`).set('Authorization', auth(user)).send({ items, submissionKey: `k-${Math.random().toString(36).slice(2)}` })
const act = (requestId, action, { eventId = 'event', user = tech } = {}) =>
  request(app).post(`/api/requests/${eventId}/equipment-requests/${requestId}/actions`).set('Authorization', auth(user)).send({ action })
const check = (requestId, { eventId = 'event', user = tech } = {}) =>
  request(app).get(`/api/requests/${eventId}/equipment-requests/${requestId}/availability`).set('Authorization', auth(user))
const view = (user, eventId = 'event') => request(app).get(`/api/requests/${eventId}`).set('Authorization', auth(user))
const patch = (user, body, eventId = 'event') => request(app).patch(`/api/requests/${eventId}`).set('Authorization', auth(user)).send(body)

const reservations = () => [...db.collectionData(EQUIPMENT_RESERVATIONS_COLLECTION).entries()].map(([id, data]) => ({ id, ...data }))
const storedRequest = (id) => db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id)
const storedEvent = (id = 'event') => db.collectionData('eventRequests').get(id)
const activity = (id = 'event') => [...db.collectionData(`eventRequests/${id}/activity`).values()]

// Submit as the Coordinator, approve as the assignee; returns the request id and its assignee.
async function approvedRequest(items, { eventId = 'event', user = coordinator } = {}) {
  const created = await submit(items, { eventId, user })
  expect(created.status).toBe(201)
  const id = created.body.equipmentRequest.id
  const assignee = [tech, secondTech].find((staff) => staff.uid === storedRequest(id).assignedTechnicalStaffUid)
  expect((await act(id, 'approve', { eventId, user: assignee })).status).toBe(200)
  return { id, assignee }
}

describe('SPM-62 — reserve (integration)', () => {
  it('spm62_api_reserves_the_whole_request_and_associates_it_with_the_event', async () => {
    const { id, assignee } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }, { equipmentTypeId: 'mic', quantity: 1 }])

    const response = await act(id, 'reserve', { user: assignee })

    expect(response.status).toBe(200)
    expect(response.body.equipmentRequest).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.RESERVED, reservedByName: assignee.name })
    // Type, quantity, the event and the reserved date/time on each reservation; lowest asset tags first.
    expect(reservations().map(({ equipmentTypeId, quantity, eventRequestId, unitIds, startsAt, endsAt, status }) => ({ equipmentTypeId, quantity, eventRequestId, unitIds, startsAt, endsAt, status }))).toEqual([
      { equipmentTypeId: 'projector', quantity: 2, eventRequestId: 'event', unitIds: ['proj-1', 'proj-2'], startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', status: RESERVATION_STATUS.ACTIVE },
      { equipmentTypeId: 'mic', quantity: 1, eventRequestId: 'event', unitIds: ['mic-1'], startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', status: RESERVATION_STATUS.ACTIVE },
    ])
    expect(reservations().every((reservation) => !Object.keys(reservation).some((key) => /venue|booking/i.test(key))), 'belongs to the event, not a venue booking').toBe(true)
    expect(storedEvent().reservedEquipment.items).toEqual([
      { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2 },
      { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', quantity: 1 },
    ])
    expect(storedEvent().currentEquipmentRequest).toEqual({ id, status: EQUIPMENT_REQUEST_STATUS.RESERVED })
    expect(activity().find((entry) => entry.type === EQUIPMENT_RESERVED)).toMatchObject({ equipmentRequestId: id, actor: { uid: assignee.uid } })
    // Each type's lock was read and written in the reservation's transaction.
    const last = db.transactions.at(-1)
    expect(last.writes).toEqual(expect.arrayContaining(['systemLocks/equipmentReservation-projector', 'systemLocks/equipmentReservation-mic']))
  })

  it('spm62_api_a_shortfall_at_the_moment_of_reserving_refuses_the_whole_reservation', async () => {
    const mine = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }, { equipmentTypeId: 'mic', quantity: 1 }])
    // Another overlapping event reserves two of the three projectors after this request was approved.
    const theirs = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }], { eventId: 'other', user: otherCoordinator })
    expect((await act(theirs.id, 'reserve', { eventId: 'other', user: theirs.assignee })).status).toBe(200)
    const before = reservations().length

    const response = await act(mine.id, 'reserve', { user: mine.assignee })

    expect(response.status).toBe(409)
    expect(response.body.availability.fulfillable).toBe(false)
    expect(response.body.availability.items.find((item) => item.equipmentTypeId === 'projector')).toMatchObject({ requestedQuantity: 2, availableQuantity: 1, shortfall: 1 })
    expect(reservations()).toHaveLength(before)
    expect(storedRequest(mine.id).status).toBe(EQUIPMENT_REQUEST_STATUS.APPROVED)
    expect(storedEvent().reservedEquipment).toBeUndefined()
  })

  it('spm62_api_only_an_approved_request_can_be_reserved_once', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const id = created.body.equipmentRequest.id
    expect((await act(id, 'reserve')).status).toBe(409)
    expect((await act(id, 'approve')).status).toBe(200)
    expect((await act(id, 'reserve')).status).toBe(200)
    expect((await act(id, 'reserve')).status).toBe(409)
    expect(reservations()).toHaveLength(1)
  })
})

describe('SPM-62 — authorisation (integration)', () => {
  it('spm62_api_denies_every_user_who_is_not_technical_support_staff', async () => {
    const { id } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 1 }])
    for (const user of [coordinator, organiser, venueStaff]) {
      expect((await act(id, 'reserve', { user })).status, user.uid).toBe(403)
    }
    expect(reservations()).toHaveLength(0)
  })

  it('spm62_api_technical_staff_not_assigned_to_the_request_get_404', async () => {
    const { id, assignee } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 1 }])
    const other = [tech, secondTech].find((staff) => staff.uid !== assignee.uid)
    expect((await act(id, 'reserve', { user: other })).status).toBe(404)
    expect(reservations()).toHaveLength(0)
  })
})

describe('SPM-62 — effects of a reservation (integration)', () => {
  it('spm62_api_the_organiser_sees_reserved_types_and_quantities_without_unit_ids', async () => {
    const { id, assignee } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }])
    expect((await view(organiser)).body.reservedEquipment).toBeNull()
    await act(id, 'reserve', { user: assignee })

    const response = await view(organiser)

    expect(response.status).toBe(200)
    expect(response.body.reservedEquipment).toEqual({ items: [{ equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: expect.any(String) })
    const body = JSON.stringify(response.body)
    for (const hidden of ['proj-1', 'proj-2', 'P-1', 'P-2']) expect(body).not.toContain(hidden)
  })

  it('spm62_api_equipment_preparation_opens_on_the_reservation', async () => {
    const { id, assignee } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 1 }])
    // Approved: the technical sign-off is set, but nothing is reserved yet.
    const before = await patch(assignee, { equipmentPreparation: { status: 'in_progress' } })
    expect(before.status).toBe(403)
    expect((await view(assignee)).body.preparation.equipmentPreparation).toEqual({ editable: false, readOnlyReason: PREPARATION_EQUIPMENT_NOT_RESERVED })

    await act(id, 'reserve', { user: assignee })

    const after = await patch(assignee, { equipmentPreparation: { status: 'in_progress' } })
    expect(after.status).toBe(200)
    expect(after.body.request.equipmentPreparation.status).toBe('in_progress')
  })

  it('spm62_api_a_significant_change_does_not_release_the_reservation', async () => {
    const { id, assignee } = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 1 }])
    await act(id, 'reserve', { user: assignee })

    const changed = await patch(coordinator, { core: { expectedAttendees: 150 } })

    expect(changed.status).toBe(200)
    expect(reservations().map((reservation) => reservation.status)).toEqual([RESERVATION_STATUS.ACTIVE])
    expect(storedRequest(id).status).toBe(EQUIPMENT_REQUEST_STATUS.RESERVED)
    expect(storedEvent().reservedEquipment.items).toHaveLength(1)
  })

  it('spm62_api_rejecting_the_event_releases_its_reservations_for_other_events', async () => {
    const mine = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 3 }])
    await act(mine.id, 'reserve', { user: mine.assignee })

    const rejected = await request(app)
      .post('/api/event-requests/event/transitions')
      .set('Authorization', auth(coordinator))
      .send({ action: 'reject', reason: 'Venue unavailable' })
    expect(rejected.status).toBe(200)

    expect(storedEvent().status).toBe(REJECTED)
    expect(reservations().every((reservation) => reservation.status === RESERVATION_STATUS.RELEASED)).toBe(true)
    expect(storedRequest(mine.id).status).toBe(EQUIPMENT_REQUEST_STATUS.CLOSED)
    expect(storedEvent().reservedEquipment).toBeNull()
    expect(activity().some((entry) => entry.type === EQUIPMENT_RESERVATION_RELEASED)).toBe(true)
    // All three projectors are free again for the overlapping event.
    const theirs = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 3 }], { eventId: 'other', user: otherCoordinator })
    expect((await act(theirs.id, 'reserve', { eventId: 'other', user: theirs.assignee })).status).toBe(200)
  })
})

describe('SPM-57 — overlapping reservations in availability (integration)', () => {
  it('spm57_api_the_check_excludes_units_reserved_for_another_overlapping_event_but_not_its_own', async () => {
    const theirs = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }], { eventId: 'other', user: otherCoordinator })
    await act(theirs.id, 'reserve', { eventId: 'other', user: theirs.assignee })
    // Their own re-check still sees the two projectors they reserved.
    expect((await check(theirs.id, { eventId: 'other', user: theirs.assignee })).body.availability.items[0].availableQuantity).toBe(3)

    const created = await submit([{ equipmentTypeId: 'projector', quantity: 2 }])
    const id = created.body.equipmentRequest.id
    const assignee = [tech, secondTech].find((staff) => staff.uid === storedRequest(id).assignedTechnicalStaffUid)
    const response = await check(id, { user: assignee })

    expect(response.body.availability.items[0]).toMatchObject({ availableQuantity: 1, shortfall: 1 })
    expect(response.body.availability.fulfillable).toBe(false)
  })

  it('spm57_api_the_equipment_page_subtracts_reservations_overlapping_the_checked_period', async () => {
    const theirs = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 2 }], { eventId: 'other', user: otherCoordinator })
    await act(theirs.id, 'reserve', { eventId: 'other', user: theirs.assignee })
    const list = (query) => request(app).get(`/api/equipment${query}`).set('Authorization', auth(tech))
    const projector = (body) => body.equipment.find((item) => item.id === 'projector')

    // Overlapping (10:00–12:00 reserved; 11:00–13:00 checked): 3 Available, 1 Damaged, 2 reserved.
    expect(projector((await list('?from=2027-03-01T11:00:00.000Z&to=2027-03-01T13:00:00.000Z')).body)).toMatchObject({ availableUnits: 1, reservedUnits: 2 })
    // Back to back (12:00 onwards) and with no period: nothing reserved is subtracted.
    expect(projector((await list('?from=2027-03-01T12:00:00.000Z&to=2027-03-01T14:00:00.000Z')).body)).toMatchObject({ availableUnits: 3, reservedUnits: 0 })
    expect(projector((await list('')).body)).toMatchObject({ availableUnits: 3, reservedUnits: 0 })
  })

  it('spm57_api_reservations_of_a_completed_event_count_as_available', async () => {
    const theirs = await approvedRequest([{ equipmentTypeId: 'projector', quantity: 3 }], { eventId: 'other', user: otherCoordinator })
    await act(theirs.id, 'reserve', { eventId: 'other', user: theirs.assignee })
    db.collectionData('eventRequests').set('other', { ...storedEvent('other'), status: 'completed' })

    const created = await submit([{ equipmentTypeId: 'projector', quantity: 3 }])
    const id = created.body.equipmentRequest.id
    const assignee = [tech, secondTech].find((staff) => staff.uid === storedRequest(id).assignedTechnicalStaffUid)
    expect((await check(id, { user: assignee })).body.availability.fulfillable).toBe(true)
    // Reservations do not expire or get released on completion: the record is kept.
    expect(reservations().every((reservation) => reservation.status === RESERVATION_STATUS.ACTIVE)).toBe(true)
  })
})
