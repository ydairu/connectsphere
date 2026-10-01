// SPM-1 end-to-end in Chromium: real frontend, real Express API, Firebase replaced by the in-memory
// double. Flows 1 (login), 2 (protected route) and 3 (logout) plus the role matrix by direct URL.

import { requestListCopy } from '../../../frontend/src/utils/requestListCopy.js'
import { roleLabel } from '../../../frontend/src/utils/roleLabels.js'
import { ORGANISER } from '../../../shared/permissions.js'
import {
  ROLE_USERS,
  expect,
  expectForbiddenPage,
  expectLoginPage,
  loginAs,
  logout,
  test,
} from '../../shared/e2e/fixtures.js'

const PROTECTED_PATHS = ['/profile', '/requests', '/requests/drafts', '/event-requests/new']

test.describe('SPM-1 — Sign in and access only my role’s area (E2E)', () => {
  test('spm1_valid_credentials_allow_login', async ({ page }) => {
    await loginAs(page, ROLE_USERS.organiser)

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByText('Event Organiser', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My drafts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })

  test('spm1_invalid_password_rejects_login', async ({ page }) => {
    await loginAs(page, ROLE_USERS.organiser, 'wrong-password')

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  })

  test('spm1_unregistered_email_rejects_login', async ({ page }) => {
    await loginAs(page, { email: 'nobody@example.test' })
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('spm1_empty_credentials_are_rejected', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('spm1_unauthenticated_user_is_redirected_to_login', async ({ page }) => {
    for (const path of PROTECTED_PATHS) {
      await page.goto(path)
      await expectLoginPage(page)
    }
  })

  test('spm1_direct_protected_url_requires_authentication_and_resumes_after_login', async ({ page }) => {
    await page.goto('/requests/drafts')
    await expectLoginPage(page)

    await page.getByLabel('Email address').fill(ROLE_USERS.organiser.email)
    await page.getByLabel('Password', { exact: true }).fill('Sprint1-Test-Password!')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page).toHaveURL(/\/requests\/drafts$/)
    await expect(page.getByRole('heading', { name: 'Saved drafts' })).toBeVisible()
  })

  test('spm1_signed_in_session_survives_a_page_reload', async ({ page }) => {
    await loginAs(page, ROLE_USERS.attendee)
    await expect(page).toHaveURL(/\/profile$/)

    await page.reload()

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  for (const [key, account] of Object.entries(ROLE_USERS)) {
    const isOrganiser = account.roles.includes(ORGANISER)

    test(`spm1_${key}_can_access_authorised_area_and_cannot_access_unauthorised_area`, async ({ page }) => {
      await loginAs(page, account)
      await expect(page).toHaveURL(/\/profile$/)
      await expect(page.getByText(account.roles.map(roleLabel).join(', '), { exact: true })).toBeVisible()

      await page.goto('/requests')
      await expect(page.getByRole('heading', { name: requestListCopy(account.roles).title })).toBeVisible()

      await page.goto('/requests/drafts')
      if (isOrganiser) {
        await expect(page.getByRole('heading', { name: 'Saved drafts' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'My drafts' })).toBeVisible()
        return
      }

      await expectForbiddenPage(page, '/requests/drafts')
      await expect(page.getByRole('link', { name: 'My drafts' })).toHaveCount(0)
      await page.goto('/event-requests/new')
      await expectForbiddenPage(page, '/event-requests/new')
    })
  }

  test('spm1_logout_clears_authentication_and_requires_reauthentication', async ({ page }) => {
    await loginAs(page, ROLE_USERS.attendee)
    await expect(page).toHaveURL(/\/profile$/)

    await logout(page)
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation.getByRole('link', { name: 'Log in' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Profile' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)

    await page.goto('/profile')
    await expectLoginPage(page)

    await page.reload()
    await expectLoginPage(page)

    await page.goBack()
    await expect(page).not.toHaveURL(/\/profile$/)
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)

    await page.goto('/requests')
    await expectLoginPage(page)

    // Signing in again from the redirect returns the user to the page they asked for.
    await page.getByLabel('Email address').fill(ROLE_USERS.attendee.email)
    await page.getByLabel('Password', { exact: true }).fill('Sprint1-Test-Password!')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByRole('heading', { name: requestListCopy(ROLE_USERS.attendee.roles).title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
    await page.goto('/profile')
    await expect(page.getByText('Attendee', { exact: true })).toBeVisible()
  })
})
