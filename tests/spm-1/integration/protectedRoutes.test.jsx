// SPM-1 AC2, role-based page access and AC3 through the whole application: router, real
// AuthProvider and real pages, arriving by direct URL the way a user types an address or refreshes.
// Firebase is the in-memory fake; the Express API is stubbed (it has its own Supertest suite).

import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestListCopy } from '../../../frontend/src/utils/requestListCopy.js'
import { roleLabel } from '../../../frontend/src/utils/roleLabels.js'
import { ORGANISER } from '../../../shared/permissions.js'
import { ALL_ROLE_USERS, ROLE_USERS, TEST_PASSWORD } from '../../shared/fixtures/testUsers.js'
import { FORBIDDEN_HEADING, LOGIN_HEADING, currentPath, renderApp, stubApi } from '../../shared/helpers/renderApp.jsx'
import { fake } from '../../shared/mocks/firebaseClientMock.js'
import { ORGANISER_ONLY_PAGES, PROTECTED_PAGES, PUBLIC_PAGES } from '../fixtures/protectedRoutes.js'

beforeEach(() => {
  stubApi()
  for (const account of ALL_ROLE_USERS) fake.seedAccount(account)
})

async function expectLoginPage() {
  await screen.findByRole('heading', { name: LOGIN_HEADING })
  expect(currentPath()).toBe('/login')
}

async function loginThroughForm(account, password = TEST_PASSWORD) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), account.email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
  return user
}

const homeHeading = () => screen.findByRole('heading', { level: 1, name: /Manage events/ })
const navigation = () => within(screen.getByRole('navigation', { name: 'Main navigation' }))

describe('SPM-1 AC2 — protected pages redirect users who are not signed in (integration)', () => {
  it.each(PROTECTED_PAGES)('spm1_unauthenticated_user_is_redirected_to_login_from_$path', async ({ path }) => {
    renderApp(path)
    await expectLoginPage()
  })

  it('spm1_direct_protected_url_requires_authentication_then_resumes_there_after_login', async () => {
    renderApp('/requests/drafts')
    await expectLoginPage()

    await loginThroughForm(ROLE_USERS.organiser)

    await screen.findByRole('heading', { name: 'Saved drafts' })
    expect(currentPath()).toBe('/requests/drafts')
  })

  it.each(PUBLIC_PAGES)('spm1_public_page_%s_does_not_require_authentication', async (path) => {
    renderApp(path)
    await waitFor(() => expect(currentPath()).toBe(path))
    expect(navigation().getByRole('link', { name: 'Log in' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
  })
})

describe('SPM-1 — access is granted according to the assigned role (integration)', () => {
  describe.each(ALL_ROLE_USERS)('signed in as $name', (account) => {
    const isOrganiser = account.roles.includes(ORGANISER)

    beforeEach(() => fake.restoreSession(account))

    it('spm1_role_can_access_authorised_area', async () => {
      renderApp('/profile')
      await screen.findByRole('heading', { name: 'Profile' })
      expect(screen.getByText(account.roles.map(roleLabel).join(', '))).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Requests' })).toBeTruthy()
      cleanup()

      renderApp('/requests')
      await screen.findByRole('heading', { name: requestListCopy(account.roles).title })
      expect(currentPath()).toBe('/requests')
    })

    it.each(ORGANISER_ONLY_PAGES)(
      isOrganiser ? 'spm1_role_can_access_authorised_area_$path' : 'spm1_role_cannot_access_unauthorised_area_$path',
      async (page) => {
        renderApp(page.path)

        if (isOrganiser) {
          await screen.findByRole('heading', { name: page.heading })
          expect(screen.queryByRole('heading', { name: FORBIDDEN_HEADING })).toBeNull()
          expect(currentPath()).toBe(page.path)
          return
        }

        await screen.findByRole('heading', { name: FORBIDDEN_HEADING })
        expect(currentPath()).toBe(page.path)
        expect(screen.queryByRole('heading', { name: LOGIN_HEADING })).toBeNull()
        expect(screen.getByText(new RegExp(roleLabel(account.roles[0])))).toBeTruthy()
        expect(screen.queryByRole('link', { name: 'My drafts' })).toBeNull()
        expect(screen.queryByRole('link', { name: 'Create request' })).toBeNull()
      },
    )

    it(isOrganiser ? 'spm1_organiser_navigation_offers_organiser_areas' : 'spm1_navigation_hides_organiser_areas', async () => {
      renderApp('/profile')
      await screen.findByRole('heading', { name: 'Profile' })
      expect(screen.queryByRole('link', { name: 'My drafts' }) !== null).toBe(isOrganiser)
      expect(screen.queryByRole('link', { name: 'Create request' }) !== null).toBe(isOrganiser)
    })
  })

  it('spm1_authentication_alone_does_not_grant_organiser_access', async () => {
    const noRoles = { uid: 'no-roles-uid', email: 'no-roles@example.test', name: 'No Roles', roles: [] }
    fake.seedAccount(noRoles, { profile: { name: noRoles.name, email: noRoles.email } })
    fake.restoreSession(noRoles)
    renderApp('/requests/drafts')
    await screen.findByRole('heading', { name: FORBIDDEN_HEADING })
  })
})

describe('SPM-1 AC3 — logging out ends the session (integration)', () => {
  it('spm1_logout_clears_authentication', async () => {
    fake.restoreSession(ROLE_USERS.organiser)
    renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await homeHeading()
    expect(currentPath()).toBe('/')
    expect(fake.state.calls.signOut).toBe(1)
    expect(fake.state.auth.currentUser).toBeNull()
    expect(navigation().getByRole('link', { name: 'Log in' })).toBeTruthy()
    expect(navigation().queryByRole('link', { name: 'Profile' })).toBeNull()
    expect(navigation().queryByRole('link', { name: 'My drafts' })).toBeNull()
  })

  it('spm1_protected_page_requires_reauthentication_after_logout', async () => {
    fake.restoreSession(ROLE_USERS.attendee)
    renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await homeHeading()
    cleanup()

    renderApp('/profile')
    await expectLoginPage()
    cleanup()

    renderApp('/requests')
    await expectLoginPage()

    await loginThroughForm(ROLE_USERS.attendee)
    await screen.findByRole('heading', { name: requestListCopy(ROLE_USERS.attendee.roles).title })
    expect(currentPath()).toBe('/requests')
  })

  it('spm1_logout_requires_valid_credentials_to_sign_in_again', async () => {
    fake.restoreSession(ROLE_USERS.coordinator)
    renderApp('/profile')
    await screen.findByRole('heading', { name: 'Profile' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await homeHeading()
    cleanup()

    renderApp('/profile')
    await expectLoginPage()
    await loginThroughForm(ROLE_USERS.coordinator, 'wrong-password')
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.')
    expect(currentPath()).toBe('/login')
  })
})
