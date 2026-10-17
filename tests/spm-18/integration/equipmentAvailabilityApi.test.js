// SPM-18 — GET /api/requests/:id/equipment-requests/:requestId/availability through real Express routing and
// middleware, with mocked token verification and the in-memory Firestore double. The equipment request is
// created through SPM-17's real POST route. Not database verification.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { EQUIPMENT_UNIT_STATUS } from '../../../shared/equipment.js'
import { EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS } from '../../../shared/equipmentRequest.js'
import { attendee, coordinator, dualStaff, fixture, organiser, secondTech, tech, venueStaff } from '../../spm-17/fixtures.js'

const { AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE } = EQUIPMENT_UNIT_STATUS

let db
let app

// Projector: 3 Available, 1 Damaged. Microphone: 2 Available, 1 Under Repair, 1 Unavailable.
function addUnits() {
  const units = db.collectionData('equipmentUnits')
  ;[AVAILABLE, AVAILABLE, AVAILABLE, DAMAGED].forEach((status, index) => units.set(`p${index}`, { equipmentTypeId: 'projector', assetTag: `PRJ-${index}`, status }))
  ;[AVAILABLE, AVAILABLE, UNDER_REPAIR, UNAVAILABLE].forEach((status, index) => units.set(`m${index}`, { equipmentTypeId: 'mic', assetTag: `MIC-${index}`, status }))
}

beforeEach(() => {
  db = fixture({ users: [coordinator, tech, secondTech, venueStaff, organiser, attendee, dualStaff] })
  addUnits()
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
  app = createApp({ authenticate, getEventRequestDb: () => db })
})

const as = (user) => `Bearer test:${user.uid}`

// The assigned Coordinator submits through SPM-17; the request is assigned to Tech One (lowest rotation).
async function submit(items) {
  const response = await request(app)
    .post('/api/requests/event/equipment-requests')
    .set('Authorization', as(coordinator))
    .send({ items, submissionKey: `key-${Math.random().toString(36).slice(2)}` })
  expect(response.status).toBe(201)
  return response.body.equipmentRequest
}

const check = (user, requestId, eventId = 'event') =>
  request(app).get(`/api/requests/${eventId}/equipment-requests/${requestId}/availability`).set('Authorization', as(user))

function assigneeOf(requestId) {
  const uid = db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(requestId).assignedTechnicalStaffUid
  return [tech, secondTech, dualStaff].find((user) => user.uid === uid)
}

describe('SPM-18 — availability check API (integration)', () => {
  it('spm18_api_shows_available_units_per_type_for_the_event_period_and_can_fulfil', async () => {
    const created = await submit([
      { equipmentTypeId: 'projector', quantity: 3, technicalRequirements: 'HDMI to the lectern' },
      { equipmentTypeId: 'mic', quantity: 2 },
    ])

    const response = await check(assigneeOf(created.id), created.id)

    expect(response.status).toBe(200)
    expect(response.body.availability).toMatchObject({
      equipmentRequestId: created.id,
      requiredPeriod: created.requiredPeriod,
      fulfillable: true,
      items: [
        { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', requestedQuantity: 3, availableQuantity: 3, shortfall: 0, sufficient: true, technicalRequirements: 'HDMI to the lectern' },
        { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', requestedQuantity: 2, availableQuantity: 2, shortfall: 0, sufficient: true },
      ],
    })
    // The event's date, start time and duration: 1 Mar 2027 10:00 for 2 hours (SPM-17 fixture).
    expect(response.body.availability.requiredPeriod).toEqual({ startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z' })
  })

  it('spm18_api_reports_a_shortfall_when_one_type_is_short_and_the_request_cannot_be_fulfilled', async () => {
    const created = await submit([
      { equipmentTypeId: 'projector', quantity: 3 },
      { equipmentTypeId: 'mic', quantity: 3 },
    ])

    const { body } = await check(assigneeOf(created.id), created.id)

    expect(body.availability.fulfillable).toBe(false)
    expect(body.availability.items.map((item) => [item.equipmentTypeId, item.availableQuantity, item.shortfall])).toEqual([
      ['projector', 3, 0],
      ['mic', 2, 1],
    ])
  })

  it('spm18_api_a_unit_marked_damaged_is_excluded_on_the_next_check', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 3 }])
    const assignee = assigneeOf(created.id)
    expect((await check(assignee, created.id)).body.availability.fulfillable).toBe(true)

    db.collectionData('equipmentUnits').set('p0', { equipmentTypeId: 'projector', assetTag: 'PRJ-0', status: DAMAGED })

    const recheck = (await check(assignee, created.id)).body.availability
    expect(recheck.items[0]).toMatchObject({ availableQuantity: 2, shortfall: 1 })
    expect(recheck.fulfillable).toBe(false)
  })

  it('spm18_api_a_reserved_request_can_be_rechecked', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const stored = db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(created.id)
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set(created.id, { ...stored, status: EQUIPMENT_REQUEST_STATUS.RESERVED })

    const response = await check(assigneeOf(created.id), created.id)
    expect(response.status).toBe(200)
    expect(response.body.availability.items[0].availableQuantity).toBe(3)
  })

  it('spm18_api_writes_nothing', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const before = JSON.stringify([...db.collectionData(EQUIPMENT_REQUESTS_COLLECTION)])

    await check(assigneeOf(created.id), created.id)

    expect(JSON.stringify([...db.collectionData(EQUIPMENT_REQUESTS_COLLECTION)])).toBe(before)
  })
})

describe('SPM-18 — validation and failure paths (integration)', () => {
  it('spm18_api_rejects_a_stored_quantity_of_zero_or_less_with_a_validation_message', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const stored = db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(created.id)
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set(created.id, { ...stored, items: [{ ...stored.items[0], quantity: 0 }] })

    const response = await check(assigneeOf(created.id), created.id)

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual({ 'items.0.quantity': 'The requested quantity must be a whole number of 1 or more.' })
  })

  it('spm18_api_refuses_a_closed_or_rejected_request_with_409', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const stored = db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(created.id)
    for (const status of [EQUIPMENT_REQUEST_STATUS.CLOSED, EQUIPMENT_REQUEST_STATUS.REJECTED]) {
      db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).set(created.id, { ...stored, status })
      expect((await check(assigneeOf(created.id), created.id)).status, status).toBe(409)
    }
  })

  it('spm18_api_returns_404_for_a_missing_request_or_one_from_another_event', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const assignee = assigneeOf(created.id)

    expect((await check(assignee, 'missing')).status).toBe(404)
    expect((await check(assignee, created.id, 'other')).status).toBe(404)
    expect((await check(assignee, created.id, 'missing-event')).status).toBe(404)
  })
})

describe('SPM-18 — authorisation (integration)', () => {
  it('spm18_api_requires_sign_in', async () => {
    expect((await request(app).get('/api/requests/event/equipment-requests/x/availability')).status).toBe(401)
  })

  it('spm18_api_denies_every_user_who_is_not_technical_support_staff', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])

    for (const user of [coordinator, organiser, attendee, venueStaff]) {
      const response = await check(user, created.id)
      expect(response.status, user.uid).toBe(403)
      expect(response.body.availability).toBeUndefined()
    }
  })

  it('spm18_api_technical_support_staff_not_assigned_to_the_request_get_404', async () => {
    const created = await submit([{ equipmentTypeId: 'projector', quantity: 1 }])
    const assignee = assigneeOf(created.id)
    const others = [tech, secondTech, dualStaff].filter((user) => user.uid !== assignee.uid)

    for (const user of others) expect((await check(user, created.id)).status, user.uid).toBe(404)
  })
})
