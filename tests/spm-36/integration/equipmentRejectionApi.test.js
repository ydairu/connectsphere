// SPM-36 — POST /api/requests/:id/equipment-requests/:requestId/actions with { action: 'reject', reason,
// suggestedAlternative }, through real Express routing and middleware, with mocked token verification and the
// in-memory double.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { approvalFixture, coordinator, fiveProjectors, organiser, secondTech, submitAs, tech } from '../fixtures.js'

let db
let app

beforeEach(() => {
  db = approvalFixture()
  const authenticate = createAuthenticate({
    verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => {
      const profile = db.collectionData('users').get(uid)
      return profile ? { uid, ...profile } : null
    },
  })
  app = createApp({ authenticate, getEventRequestDb: () => db, getEquipmentDb: () => db })
})

const reject = (requestId, body, user = tech) =>
  request(app).post(`/api/requests/event/equipment-requests/${requestId}/actions`).set('Authorization', `Bearer test:${user.uid}`).send({ action: 'reject', ...body })

describe('SPM-36 reject API', () => {
  it('spm36_api_reject_200_with_the_rejected_request', async () => {
    const created = await submitAs(db, fiveProjectors)
    const response = await reject(created.id, { reason: 'Only 3 projectors', suggestedAlternative: 'Three projectors' })
    expect(response.status).toBe(200)
    expect(response.body.equipmentRequest).toMatchObject({ id: created.id, status: 'rejected', rejectionReason: 'Only 3 projectors', suggestedAlternative: 'Three projectors', rejectedByName: 'Tech One' })
  })

  it('spm36_api_missing_reason_400_with_field_errors', async () => {
    const created = await submitAs(db, fiveProjectors)
    const response = await reject(created.id, { reason: '' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Validation failed', errors: { reason: 'A reason is required.' } })
  })

  it('spm36_api_refusals_403_404_409', async () => {
    const created = await submitAs(db, fiveProjectors)
    expect((await reject(created.id, { reason: 'r' }, coordinator)).status).toBe(403)
    expect((await reject(created.id, { reason: 'r' }, organiser)).status).toBe(403)
    expect((await reject(created.id, { reason: 'r' }, secondTech)).status).toBe(404)
    await reject(created.id, { reason: 'r' })
    expect((await reject(created.id, { reason: 'again' })).status).toBe(409)
  })
})
