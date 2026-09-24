// SPM-2 AC3, AC4 and AC6 through the real AuthProvider: account creation, profile persistence, role
// assignment, duplicate-email rejection, internal-role rejection and rollback, with the Firebase SDK
// replaced by the in-memory fake.

import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../../../frontend/src/context/AuthContext.jsx'
import { useAuth } from '../../../frontend/src/hooks/useAuth.js'
import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import { ROLE_USERS, TEST_PASSWORD } from '../../shared/fixtures/testUsers.js'
import { fake, firebaseError } from '../../shared/mocks/firebaseClientMock.js'
import {
  ATTENDEE_REGISTRATION,
  INTERNAL_ROLES,
  ORGANISER_REGISTRATION,
  UNSUPPORTED_ACCOUNT_TYPES,
  internalRoleRegistration,
} from '../fixtures/registrations.js'

const EXISTING = ROLE_USERS.attendee

beforeEach(() => fake.seedAccount(EXISTING))

async function mountAuth() {
  const hook = renderHook(useAuth, { wrapper: AuthProvider })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

const accountFor = (email) => fake.state.accounts.get(email.toLowerCase())
const profileFor = (uid) => fake.state.profiles.get(uid)

function expectNothingCreated(auth, before) {
  expect(fake.snapshot()).toEqual(before)
  expect(fake.state.calls.createUser).toEqual([])
  expect(fake.state.calls.setDoc).toEqual([])
  expect(auth.user).toBeNull()
}

describe('SPM-2 AC3 — valid registration creates an account with the selected role (integration)', () => {
  it('spm2_attendee_can_register', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register(ATTENDEE_REGISTRATION))

    const account = accountFor(ATTENDEE_REGISTRATION.email)
    expect(account).toMatchObject({ email: ATTENDEE_REGISTRATION.email, password: ATTENDEE_REGISTRATION.password })
    expect(fake.state.calls.createUser).toEqual([{ email: ATTENDEE_REGISTRATION.email, password: ATTENDEE_REGISTRATION.password }])
    expect(fake.state.calls.updateProfile).toEqual([{ uid: account.uid, displayName: ATTENDEE_REGISTRATION.name }])
    expect(result.current.user.uid).toBe(account.uid)
  })

  it('spm2_attendee_receives_correct_role', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register(ATTENDEE_REGISTRATION))

    const uid = accountFor(ATTENDEE_REGISTRATION.email).uid
    expect(profileFor(uid)).toEqual({
      name: ATTENDEE_REGISTRATION.name,
      email: ATTENDEE_REGISTRATION.email,
      role: ATTENDEE,
      roles: [ATTENDEE],
      createdAt: 'server-timestamp',
    })
    expect(result.current.roles).toEqual([ATTENDEE])
  })

  it('spm2_event_organiser_can_register', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register({ ...ORGANISER_REGISTRATION, organisationName: '  Example Events Ltd  ' }))

    const account = accountFor(ORGANISER_REGISTRATION.email)
    expect(account.password).toBe(ORGANISER_REGISTRATION.password)
    expect(result.current.user.uid).toBe(account.uid)
    expect(profileFor(account.uid)).toMatchObject({ organisationName: 'Example Events Ltd' })
  })

  it('spm2_event_organiser_receives_correct_role', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register(ORGANISER_REGISTRATION))

    const uid = accountFor(ORGANISER_REGISTRATION.email).uid
    expect(profileFor(uid)).toEqual({
      name: ORGANISER_REGISTRATION.name,
      email: ORGANISER_REGISTRATION.email,
      role: ORGANISER,
      roles: [ORGANISER],
      organisationName: ORGANISER_REGISTRATION.organisationName,
      createdAt: 'server-timestamp',
    })
    expect(result.current.roles).toEqual([ORGANISER])
  })

  it.each(['', '   ', undefined])('spm2_event_organiser_requires_organisation_(%j)', async (organisationName) => {
    const { result } = await mountAuth()
    const before = fake.snapshot()
    await expect(result.current.register({ ...ORGANISER_REGISTRATION, organisationName })).rejects.toMatchObject({
      code: 'profile/invalid-organisation',
    })
    expectNothingCreated(result.current, before)
  })

  it('spm2_attendee_registration_ignores_organisation', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register({ ...ATTENDEE_REGISTRATION, organisationName: 'Should Not Persist' }))
    expect(profileFor(accountFor(ATTENDEE_REGISTRATION.email).uid)).not.toHaveProperty('organisationName')
  })

  it('spm2_registered_attendee_can_login', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register(ATTENDEE_REGISTRATION))
    const uid = result.current.user.uid
    await act(() => result.current.logout())
    expect(result.current.user).toBeNull()

    await act(() => result.current.login(ATTENDEE_REGISTRATION.email, ATTENDEE_REGISTRATION.password))
    expect(result.current.user.uid).toBe(uid)
    expect(result.current.roles).toEqual([ATTENDEE])
  })

  it('spm2_registered_event_organiser_can_login', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.register(ORGANISER_REGISTRATION))
    await act(() => result.current.logout())

    await act(() => result.current.login(ORGANISER_REGISTRATION.email, ORGANISER_REGISTRATION.password))
    expect(result.current.roles).toEqual([ORGANISER])
    expect(result.current.userProfile.organisationName).toBe(ORGANISER_REGISTRATION.organisationName)
  })

  it('spm2_weak_password_is_rejected_and_no_account_is_created', async () => {
    const { result } = await mountAuth()
    const before = fake.snapshot()
    await expect(result.current.register({ ...ATTENDEE_REGISTRATION, password: 'abc' })).rejects.toMatchObject({
      code: 'auth/weak-password',
    })
    expect(fake.snapshot()).toEqual(before)
    expect(result.current.user).toBeNull()
  })

  it('spm2_invalid_email_is_rejected_and_no_account_is_created', async () => {
    const { result } = await mountAuth()
    const before = fake.snapshot()
    await expect(result.current.register({ ...ATTENDEE_REGISTRATION, email: 'not-an-email' })).rejects.toMatchObject({
      code: 'auth/invalid-email',
    })
    expect(fake.snapshot()).toEqual(before)
  })
})

describe('SPM-2 AC4 — an email that is already registered is rejected (integration)', () => {
  const duplicate = { ...ATTENDEE_REGISTRATION, name: 'Impostor', email: EXISTING.email, password: 'another-pass-1' }

  it('spm2_duplicate_email_is_rejected', async () => {
    const { result } = await mountAuth()
    await expect(result.current.register(duplicate)).rejects.toMatchObject({ code: 'auth/email-already-in-use' })
    expect(result.current.user).toBeNull()
  })

  it('spm2_duplicate_registration_does_not_create_second_user', async () => {
    const { result } = await mountAuth()
    const before = fake.snapshot()
    await expect(result.current.register(duplicate)).rejects.toBeTruthy()

    expect(fake.snapshot()).toEqual(before)
    expect(fake.state.accounts.size).toBe(1)
    expect(fake.state.calls.setDoc).toEqual([])
  })

  it('spm2_duplicate_registration_does_not_modify_the_existing_account', async () => {
    const { result } = await mountAuth()
    await expect(result.current.register({ ...duplicate, role: ORGANISER, organisationName: 'Hijack Org' })).rejects.toBeTruthy()

    expect(accountFor(EXISTING.email)).toMatchObject({ uid: EXISTING.uid, password: TEST_PASSWORD, displayName: EXISTING.name })
    expect(profileFor(EXISTING.uid)).toMatchObject({ roles: EXISTING.roles })
    expect(profileFor(EXISTING.uid)).not.toHaveProperty('organisationName')

    await act(() => result.current.login(EXISTING.email, TEST_PASSWORD))
    expect(result.current.roles).toEqual(EXISTING.roles)
  })

  it('spm2_duplicate_email_is_detected_regardless_of_letter_case', async () => {
    const { result } = await mountAuth()
    await expect(result.current.register({ ...duplicate, email: EXISTING.email.toUpperCase() })).rejects.toMatchObject({
      code: 'auth/email-already-in-use',
    })
    expect(fake.state.accounts.size).toBe(1)
  })
})

describe('SPM-2 AC6 — internal staff roles cannot be self-registered (integration)', () => {
  it.each(INTERNAL_ROLES)('spm2_%s_cannot_self_register', async (role) => {
    const { result } = await mountAuth()
    const before = fake.snapshot()

    await expect(result.current.register(internalRoleRegistration(role))).rejects.toThrow('Invalid registration role.')

    expectNothingCreated(result.current, before)
    const profilesWithRole = [...fake.state.profiles.values()].filter((profile) => profile.roles?.includes(role))
    expect(profilesWithRole).toEqual([])
  })

  it.each(UNSUPPORTED_ACCOUNT_TYPES)('spm2_manipulated_role_request_%j_is_rejected', async (role) => {
    const { result } = await mountAuth()
    const before = fake.snapshot()
    await expect(result.current.register({ ...ATTENDEE_REGISTRATION, role })).rejects.toThrow('Invalid registration role.')
    expectNothingCreated(result.current, before)
  })

  it('spm2_registration_cannot_inject_privileged_profile_fields', async () => {
    const { result } = await mountAuth()
    await act(() =>
      result.current.register({
        ...ATTENDEE_REGISTRATION,
        roles: ['coordinator', 'attendee'],
        organisationId: 'SOMEONE-ELSES-ORG',
        seedTag: 'fake',
      }),
    )
    const profile = profileFor(accountFor(ATTENDEE_REGISTRATION.email).uid)
    expect(profile.roles).toEqual([ATTENDEE])
    expect(profile).not.toHaveProperty('organisationId')
    expect(profile).not.toHaveProperty('seedTag')
    expect(result.current.roles).toEqual([ATTENDEE])
  })

  it('spm2_rejected_profile_write_removes_the_new_auth_account_so_no_privileged_state_remains', async () => {
    fake.state.failNextSetDoc = firebaseError('permission-denied')
    const { result } = await mountAuth()

    await expect(result.current.register(ATTENDEE_REGISTRATION)).rejects.toMatchObject({ code: 'permission-denied' })

    expect(fake.state.calls.createUser).toHaveLength(1)
    expect(fake.state.calls.deleteUser).toHaveLength(1)
    expect(accountFor(ATTENDEE_REGISTRATION.email)).toBeUndefined()
    expect(fake.state.profiles.size).toBe(1)
    await waitFor(() => expect(result.current.user).toBeNull())
    expect(result.current.roles).toEqual([])
  })
})
