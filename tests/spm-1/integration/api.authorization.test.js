// SPM-1 on the API: real Express routes and middleware over Supertest, with the Firebase Admin SDK
// replaced by an in-memory fake. Covers unauthenticated rejection (AC2), role resolution from the
// persisted profile (AC1) and role-based authorisation that cannot be bypassed from the client.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../../backend/src/config/firebaseAdmin.js', async () => {
  const { adminFake } = await import('../../shared/mocks/firebaseAdminMock.js')
  return { getAdminAuth: adminFake.getAdminAuth, getAdminDb: adminFake.getAdminDb }
})

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createMemoryEventRequestStore } from '../../../backend/src/testing/memoryEventRequestStore.js'
import { ORGANISER, ROLES } from '../../../shared/permissions.js'
import { ALL_ROLE_USERS, ROLE_USERS } from '../../shared/fixtures/testUsers.js'
import { adminFake } from '../../shared/mocks/firebaseAdminMock.js'
import { DRAFT_BODY, ORGANISER_ONLY_ENDPOINTS, PROTECTED_ENDPOINTS } from '../fixtures/protectedRoutes.js'

const app = createApp({ eventRequestStore: createMemoryEventRequestStore(SEED_REQUESTS) })
const NON_ORGANISERS = ALL_ROLE_USERS.filter((account) => !account.roles.includes(ORGANISER))
const tokens = new Map()

beforeEach(() => {
  adminFake.reset()
  tokens.clear()
  for (const account of ALL_ROLE_USERS) tokens.set(account.uid, adminFake.seedUser(account))
})

function call(endpoint, { token, headers = {}, body = endpoint.body } = {}) {
  let req = request(app)[endpoint.method](endpoint.path)
  if (token) req = req.set('Authorization', `Bearer ${token}`)
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value)
  if (body) req = req.send(body)
  return req
}

const tokenOf = (account) => tokens.get(account.uid)

describe('SPM-1 AC2 — protected endpoints reject unauthenticated requests (API)', () => {
  it.each(PROTECTED_ENDPOINTS)('spm1_protected_api_rejects_unauthenticated_request_$method_$path', async (endpoint) => {
    const response = await call(endpoint)
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ message: 'Unauthorized' })
  })

  it.each(PROTECTED_ENDPOINTS)('spm1_protected_api_rejects_invalid_token_$method_$path', async (endpoint) => {
    expect((await call(endpoint, { token: 'not-a-firebase-token' })).status).toBe(401)
    expect((await call(endpoint, { headers: { Authorization: 'Basic dXNlcjpwYXNz' } })).status).toBe(401)
  })

  it('spm1_expired_token_is_rejected', async () => {
    const expired = adminFake.issueToken(ROLE_USERS.attendee.uid, { error: 'auth/id-token-expired' })
    const response = await call(PROTECTED_ENDPOINTS[0], { token: expired })
    expect(response.status).toBe(401)
  })

  it('spm1_revoked_token_is_rejected', async () => {
    const revoked = adminFake.issueToken(ROLE_USERS.attendee.uid, { error: 'auth/id-token-revoked' })
    expect((await call(PROTECTED_ENDPOINTS[0], { token: revoked })).status).toBe(401)
  })

  it('spm1_valid_token_for_an_account_without_a_profile_is_rejected', async () => {
    const token = adminFake.issueToken('uid-with-no-profile', { email: 'ghost@example.test' })
    expect((await call(PROTECTED_ENDPOINTS[0], { token })).status).toBe(401)
  })

  it('spm1_unauthenticated_requests_have_no_side_effects', async () => {
    const before = adminFake.snapshot()
    await call(PROTECTED_ENDPOINTS.find((e) => e.method === 'post'))
    await call(PROTECTED_ENDPOINTS.find((e) => e.method === 'patch'), { token: 'bogus' })
    expect(adminFake.snapshot()).toEqual(before)
  })

  it('spm1_health_endpoint_is_public', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})

describe('SPM-1 AC1 — authenticated users receive exactly their assigned roles (API)', () => {
  it.each(ALL_ROLE_USERS)('spm1_role_$name_is_authenticated_with_its_assigned_roles', async (account) => {
    const response = await request(app).get('/api/profile').set('Authorization', `Bearer ${tokenOf(account)}`)
    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ uid: account.uid, email: account.email, roles: account.roles })
    const notAssigned = ROLES.filter((role) => !account.roles.includes(role))
    expect(response.body.user.roles.some((role) => notAssigned.includes(role))).toBe(false)
    expect(response.body.user).not.toHaveProperty('role')
  })
})

describe('SPM-1 — role-based authorisation on Event Organiser endpoints (API)', () => {
  describe.each(ORGANISER_ONLY_ENDPOINTS)('$method $path', (endpoint) => {
    it('spm1_role_can_access_authorised_area', async () => {
      const response = await call(endpoint, { token: tokenOf(ROLE_USERS.organiser) })
      expect([200, 201]).toContain(response.status)
    })

    it.each(NON_ORGANISERS)('spm1_role_cannot_access_unauthorised_area_$name', async (account) => {
      const before = adminFake.snapshot()
      const response = await call(endpoint, { token: tokenOf(account) })
      expect(response.status).toBe(403)
      expect(response.body).toEqual({ message: 'Forbidden' })
      expect(adminFake.snapshot()).toEqual(before)
    })
  })

  it('spm1_organiser_draft_is_owned_by_the_authenticated_user_not_the_request_body', async () => {
    const organiser = ROLE_USERS.organiser
    const response = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${tokenOf(organiser)}`)
      .send({ ...DRAFT_BODY, ownerUid: 'someone-else', organisationId: 'OTHER-ORG' })
    expect(response.status).toBe(201)
    expect(response.body.eventRequest).toMatchObject({
      ownerUid: organiser.uid,
      organisationId: organiser.organisationId,
      organisationName: organiser.organisationName,
    })
  })

  it('spm1_direct_request_cannot_bypass_role_authorization', async () => {
    const attendee = ROLE_USERS.attendee
    const response = await request(app)
      .post('/api/event-requests')
      .set('Authorization', `Bearer ${tokenOf(attendee)}`)
      .set('X-Roles', ORGANISER)
      .set('X-User-Role', ORGANISER)
      .send({ ...DRAFT_BODY, roles: [ORGANISER], role: ORGANISER })
    expect(response.status).toBe(403)
    expect(adminFake.state.eventRequests.size).toBe(0)
  })

  it('spm1_token_claims_cannot_grant_roles_the_profile_does_not_hold', async () => {
    const attendee = ROLE_USERS.attendee
    const claimingToken = adminFake.issueToken(attendee.uid, {
      email: attendee.email,
      claims: { roles: [ORGANISER], role: ORGANISER, admin: true },
    })
    const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${claimingToken}`)
    expect(profile.body.user.roles).toEqual(attendee.roles)

    const response = await request(app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${claimingToken}`)
      .send({ organisationName: 'Escalated Org' })
    expect(response.status).toBe(403)
    expect(adminFake.state.users.get(attendee.uid)).not.toHaveProperty('organisationName')
  })

  it('spm1_attendee_never_receives_internal_planning_data', async () => {
    const attendee = await request(app).get('/api/requests').set('Authorization', `Bearer ${tokenOf(ROLE_USERS.attendee)}`)
    expect(attendee.status).toBe(200)
    expect(attendee.body.requests.every((entry) => !('internal' in entry))).toBe(true)

    const coordinator = await request(app).get('/api/requests').set('Authorization', `Bearer ${tokenOf(ROLE_USERS.coordinator)}`)
    expect(coordinator.status).toBe(200)
    expect(coordinator.body.requests.some((entry) => 'internal' in entry)).toBe(true)
  })
})
