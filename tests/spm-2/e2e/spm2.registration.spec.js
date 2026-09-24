// SPM-2 end-to-end in Chromium: real frontend, real Express API, Firebase replaced by the in-memory
// double. Flows 4 (Attendee registration), 5 (Event Organiser registration) and 6 (duplicate email).

import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import {
  ROLE_USERS,
  expect,
  expectForbiddenPage,
  fillRegistration,
  loginAs,
  logout,
  test,
} from '../../shared/e2e/fixtures.js'
import { ATTENDEE_REGISTRATION, INTERNAL_ROLE_LABELS, ORGANISER_REGISTRATION } from '../fixtures/registrations.js'

const DUPLICATE_MESSAGE = 'An account with this email already exists.'

test.describe('SPM-2 — Register for an account (E2E)', () => {
  test('spm2_registration_offers_only_attendee_and_event_organiser', async ({ page }) => {
    await page.goto('/register')

    await expect(page.getByRole('radio')).toHaveCount(2)
    await expect(page.getByRole('radio', { name: /Attendee/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /Event Organiser/ })).toBeVisible()
    for (const label of INTERNAL_ROLE_LABELS) {
      await expect(page.getByText(label)).toHaveCount(0)
    }
    await expect(page.getByLabel('Organisation name')).toHaveCount(0)
  })

  test('spm2_attendee_can_register_and_access_only_attendee_functionality', async ({ page, double }) => {
    await page.goto('/register')
    await fillRegistration(page, ATTENDEE_REGISTRATION)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText(ATTENDEE_REGISTRATION.name)).toBeVisible()
    await expect(page.getByText('Attendee', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My drafts' })).toHaveCount(0)

    const { accounts, profiles } = await double.state()
    const created = accounts.find((account) => account.email === ATTENDEE_REGISTRATION.email)
    expect(created).toBeTruthy()
    expect(profiles[created.uid]).toMatchObject({ name: ATTENDEE_REGISTRATION.name, roles: [ATTENDEE] })
    expect(profiles[created.uid]).not.toHaveProperty('organisationName')

    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'Events open to you' })).toBeVisible()

    await page.goto('/requests/drafts')
    await expectForbiddenPage(page, '/requests/drafts')
    await page.goto('/event-requests/new')
    await expectForbiddenPage(page, '/event-requests/new')

    await logout(page)
    await loginAs(page, { email: ATTENDEE_REGISTRATION.email }, ATTENDEE_REGISTRATION.password)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Attendee', { exact: true })).toBeVisible()
  })

  test('spm2_event_organiser_can_register_with_organisation_and_access_organiser_functionality', async ({ page, double }) => {
    await page.goto('/register')
    await page.getByRole('radio', { name: /Event Organiser/ }).click()
    await expect(page.getByLabel('Organisation name')).toBeVisible()

    await fillRegistration(page, ORGANISER_REGISTRATION)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Organisation name is required.')).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)

    await page.getByLabel('Organisation name').fill(ORGANISER_REGISTRATION.organisationName)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Event Organiser', { exact: true })).toBeVisible()
    await expect(page.getByText(ORGANISER_REGISTRATION.organisationName)).toBeVisible()
    await expect(page.getByRole('link', { name: 'My drafts' })).toBeVisible()

    const { accounts, profiles } = await double.state()
    const created = accounts.find((account) => account.email === ORGANISER_REGISTRATION.email)
    expect(profiles[created.uid]).toMatchObject({
      roles: [ORGANISER],
      organisationName: ORGANISER_REGISTRATION.organisationName,
    })

    await page.goto('/requests/drafts')
    await expect(page.getByRole('heading', { name: 'Saved drafts' })).toBeVisible()
    await expect(page.getByText('You have no saved drafts')).toBeVisible()

    await logout(page)
    await loginAs(page, { email: ORGANISER_REGISTRATION.email }, ORGANISER_REGISTRATION.password)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText('Event Organiser', { exact: true })).toBeVisible()
  })

  test('spm2_duplicate_email_is_rejected_with_a_clear_error', async ({ page, double }) => {
    const before = await double.state()

    await page.goto('/register')
    await fillRegistration(page, { ...ATTENDEE_REGISTRATION, email: ROLE_USERS.attendee.email })
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('alert')).toHaveText(DUPLICATE_MESSAGE)
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByLabel('Email address')).toHaveValue(ROLE_USERS.attendee.email)

    const after = await double.state()
    expect(after.accounts).toHaveLength(before.accounts.length)
    expect(after.profiles[ROLE_USERS.attendee.uid]).toEqual(before.profiles[ROLE_USERS.attendee.uid])

    await loginAs(page, ROLE_USERS.attendee)
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByText(ROLE_USERS.attendee.name)).toBeVisible()
  })

  test('spm2_incomplete_registration_is_rejected_before_submission', async ({ page, double }) => {
    const before = await double.state()
    await page.goto('/register')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Full name is required.')).toBeVisible()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    await expect(page.getByText('Password must contain at least 6 characters.')).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)
    expect((await double.state()).accounts).toHaveLength(before.accounts.length)
  })
})
