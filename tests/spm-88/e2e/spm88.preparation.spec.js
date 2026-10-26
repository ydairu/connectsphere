// SPM-88 browser journey against React, Express and the in-memory Firebase double.
// The double supplies a safety approval for this test only; production remains blocked until SPM-91/92.

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const EVENT_ID = 'seed-req-a1-confirmed'
const coordinator = SEED_ACCOUNTS.coordinator3
const headers = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

async function prepareSafety(request) {
  expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/coordinator3`)).ok()).toBeTruthy()
  expect((await request.post(`${DOUBLE_ORIGIN}/__double__/safety-approvals/${EVENT_ID}`)).ok()).toBeTruthy()
}

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-88 — Start Preparation', () => {
  test('assigned Coordinator starts the stage; staff receive notices and edit only their own preparation', async ({ page, request }) => {
    await prepareSafety(request)
    await signIn(page, coordinator)
    await page.goto(`/requests/${EVENT_ID}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Confirmed')
    await page.getByRole('button', { name: 'Start Preparation' }).click()
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Preparation')
    await logout(page)

    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto('/notifications')
    await expect(page.getByText(/Preparation has started for/)).toBeVisible()
    await page.goto(`/requests/${EVENT_ID}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    await page.getByLabel('Venue preparation status').selectOption('ready')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toHaveText('Changes saved.')
    await expect(page.getByLabel('Equipment preparation status')).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/notifications')
    await expect(page.getByText(/Preparation has started for/)).toBeVisible()
    await page.goto(`/requests/${EVENT_ID}`)
    await page.getByRole('tab', { name: 'Equipment Required' }).click()
    await page.getByLabel('Equipment preparation notes').fill('Projector tested')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toHaveText('Changes saved.')
    await expect(page.getByLabel('Venue preparation status')).toHaveCount(0)
    await logout(page)

    await signIn(page, coordinator)
    await page.goto(`/requests/${EVENT_ID}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    await expect(page.getByText('Ready')).toBeVisible()
    await page.getByRole('tab', { name: 'Equipment Required' }).click()
    await expect(page.getByText('Projector tested')).toBeVisible()
  })

  test('unassigned Coordinator is refused; Organiser and Attendee see the status without preparation data', async ({ page, request }) => {
    await prepareSafety(request)
    const refused = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${EVENT_ID}/transitions`, {
      headers: headers(ROLE_USERS.coordinator), data: { action: 'start_preparation' },
    })
    expect(refused.status()).toBe(404)
    const started = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${EVENT_ID}/transitions`, {
      headers: headers(coordinator), data: { action: 'start_preparation' },
    })
    expect(started.status()).toBe(200)

    for (const account of [ROLE_USERS.organiser, ROLE_USERS.attendee]) {
      await signIn(page, account)
      await page.goto(`/requests/${EVENT_ID}`)
      await expect(page.locator('.page-heading .status-pill')).toHaveText('Preparation')
      await expect(page.getByRole('heading', { name: 'Venue preparation' })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Equipment preparation' })).toHaveCount(0)
      await logout(page)
    }
  })

  test('Coordinator cancels a Preparation event directly before it starts', async ({ page, request }) => {
    await prepareSafety(request)
    await signIn(page, coordinator)
    await page.goto(`/requests/${EVENT_ID}`)
    await page.getByRole('button', { name: 'Start Preparation' }).click()
    await page.getByRole('button', { name: 'Cancel event' }).click()
    await page.getByLabel('Reason (required)').fill('Venue unavailable')
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Cancel event' }).click()
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Cancelled')
  })

  test('an Organiser cancellation request stays actionable after Preparation starts', async ({ page, request }) => {
    await prepareSafety(request)
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${EVENT_ID}`)
    await page.getByRole('button', { name: 'Request cancellation' }).click()
    await page.getByLabel('Reason (required)').fill('Speaker withdrew')
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Request cancellation' }).click()
    await logout(page)

    const started = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${EVENT_ID}/transitions`, {
      headers: headers(coordinator), data: { action: 'start_preparation' },
    })
    expect(started.status()).toBe(200)
    await signIn(page, coordinator)
    await page.goto(`/requests/${EVENT_ID}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Preparation')
    await page.getByRole('button', { name: 'Approve cancellation' }).click()
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Approve cancellation' }).click()
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Cancelled')
  })
})
