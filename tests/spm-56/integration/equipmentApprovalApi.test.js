// SPM-56 — POST /api/requests/:id/equipment-requests/:requestId/actions and GET /api/equipment/requests/assigned,
// through real Express routing and middleware, with mocked token verification and the in-memory double.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { approvalFixture, coordinator, organiser, secondTech, shortInput, submitAs, tech, venueStaff } from '../fixtures.js'

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
  app = createApp({ authenticate, getEventRequestDb: () => db, getEquipmentDb: () => db })
})

const act = (requestId, action, user = tech) =>
  request(app).post(`/api/requests/event/equipment-requests/${requestId}/actions`).set('Authorization', `Bearer test:${user.uid}`).send({ action })
const queue = (user) => request(app).get('/api/equipment/requests/assigned').set('Authorization', `Bearer test:${user.uid}`)

describe('SPM-56 approval API', () => {
  it('spm56_api_requires_sign_in', async () => {
    expect((await request(app).post('/api/requests/event/equipment-requests/x/actions').send({ action: 'approve' })).status).toBe(401)
    expect((await request(app).get('/api/equipment/requests/assigned')).status).toBe(401)
  })

  it('spm56_api_approve_200_with_the_request_and_availability', async () => {
    const created = await submitAs(db)
    const response = await act(created.id, 'approve')
    expect(response.status).toBe(200)
    expect(response.body.equipmentRequest).toMatchObject({ id: created.id, status: 'approved', approvedByName: 'Tech One' })
    expect(response.body.availability.fulfillable).toBe(true)
  })

  it('spm56_api_shortfall_is_409_with_per_item_availability', async () => {
    const created = await submitAs(db, shortInput)
    const response = await act(created.id, 'approve')
    expect(response.status).toBe(409)
    expect(response.body.availability.fulfillable).toBe(false)
    expect(response.body.availability.items.find((item) => item.equipmentTypeId === 'projector')).toMatchObject({ requestedQuantity: 4, availableQuantity: 3, shortfall: 1 })
  })

  it('spm56_api_refusals_400_403_404_409', async () => {
    const created = await submitAs(db)
    expect((await act(created.id, 'reject')).status).toBe(400)
    expect((await act(created.id, undefined)).status).toBe(400)
    expect((await act(created.id, 'approve', coordinator)).status).toBe(403)
    expect((await act(created.id, 'approve', organiser)).status).toBe(403)
    expect((await act(created.id, 'approve', secondTech)).status).toBe(404)
    expect((await act('missing', 'approve')).status).toBe(404)
    await act(created.id, 'approve')
    expect((await act(created.id, 'approve')).status).toBe(409)
  })

  it('spm56_api_queue_200_for_technical_staff_403_otherwise', async () => {
    const created = await submitAs(db)
    const mine = await queue(tech)
    expect(mine.status).toBe(200)
    expect(mine.body.requests.map((entry) => entry.id)).toEqual([created.id])
    expect((await queue(secondTech)).body.requests).toEqual([])
    for (const user of [coordinator, venueStaff, organiser]) expect((await queue(user)).status).toBe(403)
  })

  it('spm56_api_equipment_detail_route_still_works_beside_the_queue', async () => {
    const response = await request(app).get('/api/equipment/projector').set('Authorization', `Bearer test:${tech.uid}`)
    expect(response.status).toBe(200)
  })
})
