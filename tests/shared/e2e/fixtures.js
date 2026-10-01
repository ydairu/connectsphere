// Playwright fixtures shared by the SPM-1 and SPM-2 E2E suites. Every test starts from a freshly
// reset double (seeded role accounts, no registrations) and a new browser context (no session).

import { expect, test as base } from '@playwright/test'
import { EXTRA_USERS, ROLE_USERS, TEST_PASSWORD } from '../fixtures/testUsers.js'

export const DOUBLE_ORIGIN = process.env.E2E_DOUBLE_ORIGIN ?? 'http://127.0.0.1:5001'
export const LOGIN_HEADING = 'Welcome back'
export const FORBIDDEN_HEADING = 'You do not have access to this page'

export const test = base.extend({
  double: [
    async ({ request }, use) => {
      const reset = async () => {
        const response = await request.post(`${DOUBLE_ORIGIN}/__double__/reset`)
        expect(response.ok(), 'Firebase double reset').toBeTruthy()
      }
      const state = async () => (await request.get(`${DOUBLE_ORIGIN}/__double__/state`)).json()
      await reset()
      await use({ reset, state })
    },
    { auto: true },
  ],
})

export { expect, EXTRA_USERS, ROLE_USERS, TEST_PASSWORD }

export async function loginAs(page, account, password = TEST_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function logout(page) {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/$/)
}

export async function fillRegistration(page, registration) {
  await page.getByLabel('Full name').fill(registration.name)
  await page.getByLabel('Email address').fill(registration.email)
  await page.getByLabel('Password', { exact: true }).fill(registration.password)
  await page.getByLabel('Confirm password').fill(registration.password)
}

export async function expectLoginPage(page) {
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: LOGIN_HEADING })).toBeVisible()
}

export async function expectForbiddenPage(page, path) {
  await expect(page.getByRole('heading', { name: FORBIDDEN_HEADING })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`))
}
