// SPM-58 — viewing which event each equipment reservation is for: GET /api/equipment/reservations, the units
// on GET /api/equipment/:id, and the event's reserved equipment on GET /api/requests/:id. Real Express routing
// and middleware, mocked token verification, the in-memory Firestore double. Not database verification;
// simultaneous reservations are tested on the Firestore emulator (equipmentReservation.emulator.test.js).

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { EQUIPMENT_REQUESTS_COLLECTION } from '../../../shared/equipmentRequest.js'
import { RESERVATION_STATUS } from '../../../shared/equipmentReservation.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { approvalFixture, coordinator, organiser, otherCoordinator, secondTech, tech, venueStaff } from '../../spm-56/fixtures.js'

let db
let app

beforeEach(() => {
  db = approvalFixture()
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
  app = createApp({ authenticate, eventRequestStore: createFakeFirestoreEventRequestStore(() => db), getEventRequestDb: () => db, getEquipmentDb: () => db })
})

const auth = (user) => `Bearer test:${user.uid}`
const assigneeOf = (id) => [tech, secondTech].find((staff) => staff.uid === db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(id).assignedTechnicalStaffUid)

// Submit, approve and reserve through the real routes; returns the request id and its assignee.
async function reserved(eventId, coordinatorUser, quantity) {
  const created = await request(app).post(`/api/requests/${eventId}/equipment-requests`).set('Authorization', auth(coordinatorUser))
    .send({ items: [{ equipmentTypeId: 'projector', quantity }], submissionKey: `k-${eventId}-${quantity}` })
  expect(created.status).toBe(201)
  const id = created.body.equipmentRequest.id
  const assignee = assigneeOf(id)
  for (const action of ['approve', 'reserve']) {
    const response = await request(app).post(`/api/requests/${eventId}/equipment-requests/${id}/actions`).set('Authorization', auth(assignee)).send({ action })
    expect(response.status, action).toBe(200)
  }
  return { id, assignee }
}

const listReservations = (user, query = '') => request(app).get(`/api/equipment/reservations${query}`).set('Authorization', auth(user))

describe('SPM-58 — reservation records (integration)', () => {
  it('spm58_api_each_reservation_shows_its_event_date_time_type_quantity_and_status', async () => {
    const { assignee } = await reserved('event', coordinator, 2)

    const response = await listReservations(assignee)

    expect(response.status).toBe(200)
    expect(response.body.reservations).toEqual([
      expect.objectContaining({
        eventRequestId: 'event',
        eventTitle: 'Conference',
        startsAt: '2027-03-01T10:00:00.000Z',
        endsAt: '2027-03-01T12:00:00.000Z',
        equipmentTypeName: 'Projector',
        quantity: 2,
        assetTags: ['P-1', 'P-2'],
        status: RESERVATION_STATUS.ACTIVE,
        reservedAt: expect.any(String),
        reservedByName: assignee.name,
        releasedAt: null,
      }),
    ])
  })

  it('spm58_api_a_released_reservation_shows_released_and_the_release_time', async () => {
    const { assignee } = await reserved('event', coordinator, 1)
    const rejected = await request(app).post('/api/event-requests/event/transitions').set('Authorization', auth(coordinator)).send({ action: 'reject', reason: 'Venue unavailable' })
    expect(rejected.status).toBe(200)

    const released = (await listReservations(assignee, '?status=released')).body.reservations
    expect(released).toHaveLength(1)
    expect(released[0]).toMatchObject({ status: RESERVATION_STATUS.RELEASED, releasedAt: expect.any(String), releasedReason: 'event_rejected' })
    expect((await listReservations(assignee, '?status=active')).body.reservations).toEqual([])
  })

  it('spm58_api_rejects_an_unknown_status_filter', async () => {
    const response = await listReservations(tech, '?status=expired')
    expect(response.status).toBe(400)
    expect(response.body.errors.status).toBeTruthy()
  })
})

describe('SPM-58 — who sees which reservations (integration)', () => {
  it('spm58_api_technical_staff_see_only_reservations_of_events_assigned_to_them', async () => {
    const mine = await reserved('event', coordinator, 1)
    await reserved('other', otherCoordinator, 1)
    // Take 'other' out of every Technical Support Staff member's assignments: its reservation is then hidden.
    db.collectionData('eventRequests').set('other', { ...db.collectionData('eventRequests').get('other'), assignedStaffUids: [] })

    for (const user of [tech, secondTech]) {
      const seen = (await listReservations(user)).body.reservations.map((reservation) => reservation.eventRequestId)
      expect(seen, user.uid).toEqual(user.uid === mine.assignee.uid ? ['event'] : [])
    }
  })

  it('spm58_api_only_technical_support_staff_reach_the_reservation_list', async () => {
    for (const user of [coordinator, organiser, venueStaff]) expect((await listReservations(user)).status, user.uid).toBe(403)
    expect((await request(app).get('/api/equipment/reservations')).status).toBe(401)
  })
})

describe('SPM-58 — which event a unit is reserved for (integration)', () => {
  it('spm58_api_each_unit_lists_its_reservations_naming_only_events_the_viewer_may_see', async () => {
    const { assignee } = await reserved('event', coordinator, 2)
    const typeFor = async (user) => (await request(app).get('/api/equipment/projector').set('Authorization', auth(user))).body.equipment
    const unit = (equipment, id) => equipment.units.find((item) => item.id === id)

    const forAssignee = await typeFor(assignee)
    expect(unit(forAssignee, 'proj-1').reservations).toEqual([
      { eventRequestId: 'event', eventTitle: 'Conference', startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', reservedAt: expect.any(String) },
    ])
    expect(unit(forAssignee, 'proj-3').reservations).toEqual([])

    // 'event' is not assigned to otherCoordinator: the unit is shown as reserved, without naming the event.
    const forOther = await typeFor(otherCoordinator)
    expect(unit(forOther, 'proj-1').reservations).toEqual([
      { eventRequestId: null, eventTitle: null, startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', reservedAt: expect.any(String) },
    ])
  })
})

describe('SPM-58 — the event lists its reserved equipment (integration)', () => {
  it('spm58_api_the_event_record_lists_reserved_items_and_quantities_to_its_viewers', async () => {
    const { assignee } = await reserved('event', coordinator, 2)
    for (const user of [coordinator, organiser, assignee]) {
      const response = await request(app).get('/api/requests/event').set('Authorization', auth(user))
      expect(response.body.reservedEquipment, user.uid).toEqual({ items: [{ equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: expect.any(String) })
    }
  })
})
