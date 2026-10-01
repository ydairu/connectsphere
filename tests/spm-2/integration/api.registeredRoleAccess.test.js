// SPM-2 AC5/AC6 on the API: profiles exactly as registration persists them (buildRegistrationProfile)
// drive the real authenticate/requireRole middleware over Supertest, with Firebase Admin faked.
// Shows that a registered user's access follows their stored role and cannot be escalated by the client.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../../backend/src/config/firebaseAdmin.js', async () => {
  const { adminFake } = await import('../../shared/mocks/firebaseAdminMock.js')
  return { getAdminAuth: adminFake.getAdminAuth, getAdminDb: adminFake.getAdminDb }
})

import { createApp } from '../../../backend/src/app.js'
import { createMemoryEventRequestStore } from '../../../backend/src/testing/memoryEventRequestStore.js'
import { ATTENDEE, COORDINATOR, ORGANISER } from '../../../shared/permissions.js'
import { buildRegistrationProfile } from '../../../shared/userProfile.js'
import { adminFake } from '../../shared/mocks/firebaseAdminMock.js'
import { ATTENDEE_REGISTRATION, INTERNAL_ROLES, ORGANISER_REGISTRATION, internalRoleRegistration } from '../fixtures/registrations.js'

const app = createApp({ eventRequestStore: createMemoryEventRequestStore([]) })
const ATTENDEE_UID = 'registered-attendee'
const ORGANISER_UID = 'registered-organiser'
const DRAFT = { core: { title: 'First event' } }

let attendeeToken
let organiserToken

beforeEach(() => {
  adminFake.reset()
  attendeeToken = adminFake.seedUser({ uid: ATTENDEE_UID, email: ATTENDEE_REGISTRATION.email }, buildRegistrationProfile(ATTENDEE_REGISTRATION))
  organiserToken = adminFake.seedUser({ uid: ORGANISER_UID, email: ORGANISER_REGISTRATION.email }, buildRegistrationProfile(ORGANISER_REGISTRATION))
})

const as = (token) => ({
  get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path, body) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
  patch: (path, body) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
})

describe('SPM-2 AC5 — a registered Attendee has Attendee permissions only (API)', () => {
  it('spm2_registered_attendee_is_recognised_with_the_attendee_role', async () => {
    const response = await as(attendeeToken).get('/api/profile')
    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ uid: ATTENDEE_UID, roles: [ATTENDEE], name: ATTENDEE_REGISTRATION.name })
    expect(response.body.user.organisationName).toBeNull()
  })

  it('spm2_registered_attendee_can_access_attendee_functionality', async () => {
    const response = await as(attendeeToken).get('/api/requests')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ requests: [] })
  })

  it('spm2_registered_user_cannot_access_unauthorised_role', async () => {
    expect((await as(attendeeToken).post('/api/event-requests', DRAFT)).status).toBe(403)
    expect((await as(attendeeToken).patch('/api/profile', { organisationName: 'Org' })).status).toBe(403)
    expect(adminFake.state.eventRequests.size).toBe(0)
    expect(adminFake.state.users.get(ATTENDEE_UID)).not.toHaveProperty('organisationName')
  })
})

describe('SPM-2 AC5 — a registered Event Organiser has Organiser permissions (API)', () => {
  it('spm2_registered_user_has_correct_permissions', async () => {
    const profile = await as(organiserToken).get('/api/profile')
    expect(profile.body.user).toMatchObject({
      uid: ORGANISER_UID,
      roles: [ORGANISER],
      organisationName: ORGANISER_REGISTRATION.organisationName,
    })

    const created = await as(organiserToken).post('/api/event-requests', DRAFT)
    expect(created.status).toBe(201)
    expect(created.body.eventRequest).toMatchObject({
      ownerUid: ORGANISER_UID,
      organisationName: ORGANISER_REGISTRATION.organisationName,
      status: 'draft',
    })

    const renamed = await as(organiserToken).patch('/api/profile', { organisationName: 'Renamed Events Ltd' })
    expect(renamed.status).toBe(200)
    expect(adminFake.state.users.get(ORGANISER_UID).organisationName).toBe('Renamed Events Ltd')
  })
})

describe('SPM-2 AC6 — internal roles cannot be obtained through the API (API)', () => {
  it('spm2_registered_user_cannot_escalate_role_via_profile_update', async () => {
    for (const body of [
      { organisationName: 'Org', roles: [COORDINATOR] },
      { organisationName: 'Org', role: COORDINATOR },
      { organisationName: 'Org', organisationId: 'OTHER-ORG' },
    ]) {
      expect((await as(organiserToken).patch('/api/profile', body)).status).toBe(400)
    }
    expect(adminFake.state.users.get(ORGANISER_UID)).toMatchObject({ roles: [ORGANISER] })
    expect(adminFake.state.users.get(ORGANISER_UID)).not.toHaveProperty('organisationId')
  })

  it('spm2_manipulated_role_request_is_rejected', async () => {
    const response = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .set('X-Roles', COORDINATOR)
      .send({ ...DRAFT, roles: [COORDINATOR, ORGANISER], role: ORGANISER })
    expect(response.status).toBe(403)
    expect(adminFake.state.eventRequests.size).toBe(0)

    const claimingToken = adminFake.issueToken(ATTENDEE_UID, { claims: { roles: [COORDINATOR] } })
    const profile = await as(claimingToken).get('/api/profile')
    expect(profile.body.user.roles).toEqual([ATTENDEE])
  })

  it.each(INTERNAL_ROLES)('spm2_%s_registration_cannot_produce_an_api_identity', async (role) => {
    expect(() => buildRegistrationProfile(internalRoleRegistration(role))).toThrow('Invalid registration role.')
    // Without a persisted profile, even a valid Firebase token is refused by the API.
    const token = adminFake.issueToken(`attempted-${role}`, { email: `${role}@example.test` })
    expect((await as(token).get('/api/profile')).status).toBe(401)
  })
})
