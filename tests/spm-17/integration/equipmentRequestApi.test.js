// SPM-17 — GET and POST /api/requests/:id/equipment-requests through real Express routing and middleware,
// with mocked token verification and the in-memory Firestore double.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { coordinator, fixture, input, organiser, otherCoordinator, tech, venueStaff } from '../fixtures.js'

let db
let app

beforeEach(() => {
  db = fixture()
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

const post = (body = input, user = coordinator, id = 'event') =>
  request(app).post(`/api/requests/${id}/equipment-requests`).set('Authorization', `Bearer test:${user.uid}`).send(body)
const get = (user, id = 'event') => request(app).get(`/api/requests/${id}/equipment-requests`).set('Authorization', `Bearer test:${user.uid}`)

describe('SPM-17 equipment request API', () => {
  it('spm17_api_requires_sign_in', async () => {
    expect((await request(app).get('/api/requests/event/equipment-requests')).status).toBe(401)
    expect((await request(app).post('/api/requests/event/equipment-requests').send(input)).status).toBe(401)
  })

  it('spm17_api_creates_201_then_lists_for_the_coordinator_and_assignee', async () => {
    const created = await post()
    expect(created.status).toBe(201)
    expect(created.body.equipmentRequest).toMatchObject({ status: 'pending_review', assignedTechnicalStaffName: 'Tech One' })

    const forCoordinator = await get(coordinator)
    expect(forCoordinator.status).toBe(200)
    // SPM-56 added `actions` to each listed request: the Coordinator has none.
    expect(forCoordinator.body).toEqual({ canSubmit: false, requests: [{ ...created.body.equipmentRequest, actions: [] }] })
    expect((await get(tech)).body.requests).toHaveLength(1)
  })

  it('spm17_api_validation_is_400_with_field_errors', async () => {
    const response = await post({ submissionKey: 'k', items: [{ equipmentTypeId: 'projector', quantity: '1.5' }] })
    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual({ 'items.0.quantity': 'Enter a whole number of 1 or more.' })
  })

  it('spm17_api_refusals_403_404_409', async () => {
    expect((await post(input, organiser)).status).toBe(403)
    expect((await post(input, venueStaff)).status).toBe(403)
    expect((await post(input, otherCoordinator)).status).toBe(404)
    expect((await post(input, coordinator, 'missing')).status).toBe(404)
    await post()
    expect((await post({ ...input, submissionKey: 'attempt-2' })).status).toBe(409)
  })

  it('spm17_api_organiser_and_venue_staff_cannot_read', async () => {
    await post()
    for (const user of [organiser, venueStaff, otherCoordinator]) {
      const response = await get(user)
      expect(response.status, user.uid).toBe(404)
      expect(response.body).toEqual({ message: 'Event not found.' })
    }
  })
})
