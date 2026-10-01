// SPM-1 AC1 and AC3 through the real AuthProvider: Firebase sign-in, profile lookup, role
// resolution, session restoration and sign-out, with the Firebase SDK replaced by the in-memory fake.

import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../../../frontend/src/context/AuthContext.jsx'
import { useAuth } from '../../../frontend/src/hooks/useAuth.js'
import { COORDINATOR, ROLES } from '../../../shared/permissions.js'
import { fake } from '../../shared/mocks/firebaseClientMock.js'
import { ALL_ROLE_USERS, ROLE_USERS, TEST_PASSWORD } from '../../shared/fixtures/testUsers.js'

beforeEach(() => {
  for (const account of ALL_ROLE_USERS) fake.seedAccount(account)
})

async function mountAuth() {
  const hook = renderHook(useAuth, { wrapper: AuthProvider })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

function expectUnauthenticated(auth) {
  expect(auth.user).toBeNull()
  expect(auth.userProfile).toBeNull()
  expect(auth.roles).toEqual([])
  expect(fake.state.auth.currentUser).toBeNull()
}

describe('SPM-1 AC1 — email/password sign-in grants access by assigned role (integration)', () => {
  it.each(ALL_ROLE_USERS)('spm1_valid_credentials_allow_login_as_$name', async (account) => {
    const { result } = await mountAuth()
    await act(() => result.current.login(account.email, TEST_PASSWORD))

    expect(result.current.user.uid).toBe(account.uid)
    expect(result.current.userProfile).toMatchObject({ email: account.email, roles: account.roles })
    expect(result.current.roles).toEqual(account.roles)
    const notAssigned = ROLES.filter((role) => !account.roles.includes(role))
    expect(result.current.roles.some((role) => notAssigned.includes(role))).toBe(false)
  })

  it('spm1_login_uses_firebase_email_password_authentication', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.login(ROLE_USERS.attendee.email, TEST_PASSWORD))
    expect(fake.state.calls.signIn).toEqual([{ email: ROLE_USERS.attendee.email, password: TEST_PASSWORD }])
    expect(await result.current.user.getIdToken()).toBe(`test-token:${ROLE_USERS.attendee.uid}`)
  })

  it('spm1_invalid_password_rejects_login', async () => {
    const { result } = await mountAuth()
    await expect(result.current.login(ROLE_USERS.organiser.email, 'wrong-password')).rejects.toMatchObject({
      code: 'auth/invalid-credential',
    })
    expectUnauthenticated(result.current)
  })

  it('spm1_unregistered_email_rejects_login', async () => {
    const { result } = await mountAuth()
    await expect(result.current.login('nobody@example.test', TEST_PASSWORD)).rejects.toMatchObject({
      code: 'auth/invalid-credential',
    })
    expectUnauthenticated(result.current)
  })

  it('spm1_missing_email_is_rejected', async () => {
    const { result } = await mountAuth()
    await expect(result.current.login('', TEST_PASSWORD)).rejects.toMatchObject({ code: 'auth/invalid-email' })
    expectUnauthenticated(result.current)
  })

  it('spm1_missing_password_is_rejected', async () => {
    const { result } = await mountAuth()
    await expect(result.current.login(ROLE_USERS.attendee.email, '')).rejects.toMatchObject({
      code: 'auth/missing-password',
    })
    expectUnauthenticated(result.current)
  })

  it('spm1_empty_credentials_are_rejected', async () => {
    const { result } = await mountAuth()
    await expect(result.current.login('', '')).rejects.toMatchObject({ code: 'auth/invalid-email' })
    expectUnauthenticated(result.current)
  })

  it('spm1_firebase_account_without_application_profile_is_signed_out_again', async () => {
    const ghost = { uid: 'ghost-uid', email: 'ghost@example.test', name: 'Ghost', roles: [] }
    fake.seedAccount(ghost, { profile: null })
    const { result } = await mountAuth()

    await expect(result.current.login(ghost.email, TEST_PASSWORD)).rejects.toThrow('PROFILE_NOT_FOUND')

    expect(fake.state.calls.signOut).toBe(1)
    await waitFor(() => expectUnauthenticated(result.current))
  })
})

describe('SPM-1 — session restoration (integration)', () => {
  it('spm1_startup_without_a_session_is_unauthenticated', async () => {
    const { result } = await mountAuth()
    expectUnauthenticated(result.current)
  })

  it('spm1_persisted_firebase_session_is_restored_with_its_roles', async () => {
    fake.restoreSession(ROLE_USERS.coordinator)
    const { result } = await mountAuth()
    expect(result.current.user.uid).toBe(ROLE_USERS.coordinator.uid)
    expect(result.current.roles).toEqual([COORDINATOR])
  })

  it('spm1_restored_session_without_a_profile_carries_no_roles', async () => {
    const orphan = { uid: 'orphan-uid', email: 'orphan@example.test', name: 'Orphan', roles: [] }
    fake.seedAccount(orphan, { profile: null })
    fake.restoreSession(orphan)
    const { result } = await mountAuth()
    expect(result.current.user.uid).toBe(orphan.uid)
    expect(result.current.userProfile).toBeNull()
    expect(result.current.roles).toEqual([])
  })
})

describe('SPM-1 AC3 — logout terminates the session (integration)', () => {
  it('spm1_logout_clears_authentication', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.login(ROLE_USERS.organiser.email, TEST_PASSWORD))
    expect(result.current.roles).toEqual(ROLE_USERS.organiser.roles)

    await act(() => result.current.logout())

    expect(fake.state.calls.signOut).toBe(1)
    expectUnauthenticated(result.current)
  })

  it('spm1_logout_requires_reauthentication_with_valid_credentials', async () => {
    const { result } = await mountAuth()
    await act(() => result.current.login(ROLE_USERS.attendee.email, TEST_PASSWORD))
    await act(() => result.current.logout())

    await expect(result.current.login(ROLE_USERS.attendee.email, 'wrong-password')).rejects.toMatchObject({
      code: 'auth/invalid-credential',
    })
    expectUnauthenticated(result.current)

    await act(() => result.current.login(ROLE_USERS.attendee.email, TEST_PASSWORD))
    expect(result.current.roles).toEqual(ROLE_USERS.attendee.roles)
  })

  it('spm1_new_provider_after_logout_starts_unauthenticated', async () => {
    const first = await mountAuth()
    await act(() => first.result.current.login(ROLE_USERS.venueStaff.email, TEST_PASSWORD))
    await act(() => first.result.current.logout())
    first.unmount()

    const second = await mountAuth()
    expectUnauthenticated(second.result.current)
  })
})
