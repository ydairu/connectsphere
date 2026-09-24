// SPM-1 — the Express middleware that turns a Firebase ID token into an authenticated user with
// roles. Unit level: verification and profile loading are injected fakes, and the production binding
// is checked against a mocked Firebase Admin SDK. Nothing here reaches Firebase.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENDEE, COORDINATOR, ORGANISER } from '../../../shared/permissions.js'

const admin = vi.hoisted(() => ({ verifyIdToken: vi.fn(), collection: vi.fn() }))
vi.mock('../../../backend/src/config/firebaseAdmin.js', () => ({
  getAdminAuth: () => ({ verifyIdToken: admin.verifyIdToken }),
  getAdminDb: () => ({ collection: admin.collection }),
}))

const { authenticate: productionAuthenticate, createAuthenticate } = await import(
  '../../../backend/src/middleware/authenticate.js'
)

function fakeRequest(headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return { headers: lower, get: (name) => lower[name.toLowerCase()] }
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function run(middleware, headers) {
  const req = fakeRequest(headers)
  const res = fakeResponse()
  const next = vi.fn()
  await middleware(req, res, next)
  return { req, res, next }
}

const UNAUTHORIZED = { message: 'Unauthorized' }

describe('SPM-1 — Firebase ID token verification middleware (unit)', () => {
  const verifyIdToken = vi.fn()
  const loadProfile = vi.fn()
  const authenticate = createAuthenticate({ verifyIdToken, loadProfile })

  beforeEach(() => {
    verifyIdToken.mockReset()
    loadProfile.mockReset()
  })

  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { Authorization: 'Basic dXNlcjpwYXNz' }],
    ['a bare token without a scheme', { Authorization: 'some-token' }],
    ['a blank Bearer token', { Authorization: 'Bearer    ' }],
  ])('spm1_request_with_%s_is_rejected_before_any_verification', async (_label, headers) => {
    const { res, next } = await run(authenticate, headers)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual(UNAUTHORIZED)
    expect(verifyIdToken).not.toHaveBeenCalled()
    expect(loadProfile).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it.each([
    ['an invalid token', Object.assign(new Error('Decoding Firebase ID token failed.'), { code: 'auth/argument-error' })],
    ['an expired token', Object.assign(new Error('Firebase ID token has expired.'), { code: 'auth/id-token-expired' })],
    ['a revoked token', Object.assign(new Error('Firebase ID token has been revoked.'), { code: 'auth/id-token-revoked' })],
  ])('spm1_%s_is_rejected_with_401', async (_label, error) => {
    verifyIdToken.mockRejectedValue(error)
    const { res, next } = await run(authenticate, { Authorization: 'Bearer token-under-test' })
    expect(verifyIdToken).toHaveBeenCalledWith('token-under-test')
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual(UNAUTHORIZED)
    expect(loadProfile).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('spm1_authentication_alone_does_not_grant_access_without_an_application_profile', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-without-profile', email: 'ghost@example.test' })
    loadProfile.mockResolvedValue(null)
    const { req, res, next } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(loadProfile).toHaveBeenCalledWith('uid-without-profile')
    expect(res.statusCode).toBe(401)
    expect(req.user).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
  })

  it('spm1_valid_token_attaches_the_persisted_roles_to_the_request', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'token@example.test' })
    loadProfile.mockResolvedValue({
      name: 'Casey Coordinator',
      email: 'profile@example.test',
      roles: [COORDINATOR],
      organisationId: 'ORG-1',
      organisationName: 'Org One',
    })
    const { req, next } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toEqual({
      uid: 'uid-1',
      email: 'profile@example.test',
      roles: [COORDINATOR],
      organisationId: 'ORG-1',
      organisationName: 'Org One',
      name: 'Casey Coordinator',
    })
    expect(req.user).not.toHaveProperty('role')
  })

  it('spm1_legacy_single_role_profile_still_yields_a_roles_array', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-legacy' })
    loadProfile.mockResolvedValue({ name: 'Legacy', role: ATTENDEE })
    const { req } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(req.user.roles).toEqual([ATTENDEE])
  })

  it('spm1_roles_come_from_the_stored_profile_never_from_token_claims', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-2', roles: [ORGANISER], role: ORGANISER, admin: true })
    loadProfile.mockResolvedValue({ name: 'Real Attendee', roles: [ATTENDEE] })
    const { req } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(req.user.roles).toEqual([ATTENDEE])
    expect(req.user).not.toHaveProperty('admin')
  })

  it('spm1_profile_without_roles_yields_no_roles_rather_than_a_default_role', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-3' })
    loadProfile.mockResolvedValue({ name: 'No Roles' })
    const { req, next } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(next).toHaveBeenCalledOnce()
    expect(req.user.roles).toEqual([])
  })

  it('spm1_server_configuration_errors_are_forwarded_not_reported_as_unauthorized', async () => {
    const configError = new Error('Firebase Admin environment variables are not configured.')
    verifyIdToken.mockRejectedValue(configError)
    const { res, next } = await run(authenticate, { Authorization: 'Bearer valid' })
    expect(next).toHaveBeenCalledWith(configError)
    expect(res.body).toBeUndefined()
  })
})

describe('SPM-1 — production middleware is bound to the Firebase Admin SDK (unit, SDK mocked)', () => {
  const get = vi.fn()
  const doc = vi.fn(() => ({ get }))

  beforeEach(() => {
    admin.verifyIdToken.mockReset()
    admin.collection.mockReset().mockReturnValue({ doc })
    doc.mockClear()
    get.mockReset()
  })

  it('spm1_production_authenticate_verifies_the_bearer_token_with_firebase_and_reads_users_uid', async () => {
    admin.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid', email: 'person@example.test' })
    get.mockResolvedValue({ exists: true, data: () => ({ name: 'Person', roles: [ATTENDEE] }) })

    const { req, next } = await run(productionAuthenticate, { Authorization: 'Bearer id-token-from-client' })

    expect(admin.verifyIdToken).toHaveBeenCalledWith('id-token-from-client')
    expect(admin.collection).toHaveBeenCalledWith('users')
    expect(doc).toHaveBeenCalledWith('firebase-uid')
    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toMatchObject({ uid: 'firebase-uid', email: 'person@example.test', roles: [ATTENDEE] })
  })

  it('spm1_production_authenticate_rejects_tokens_firebase_rejects', async () => {
    admin.verifyIdToken.mockRejectedValue(Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }))
    const { res, next } = await run(productionAuthenticate, { Authorization: 'Bearer stale' })
    expect(res.statusCode).toBe(401)
    expect(admin.collection).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('spm1_production_authenticate_rejects_a_verified_user_whose_profile_document_is_missing', async () => {
    admin.verifyIdToken.mockResolvedValue({ uid: 'deleted-uid' })
    get.mockResolvedValue({ exists: false, data: () => undefined })
    const { res, next } = await run(productionAuthenticate, { Authorization: 'Bearer valid' })
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})
