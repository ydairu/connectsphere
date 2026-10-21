// SPM-47 end-to-end in Chromium: the Organiser requests cancellation with a reason, the assigned Coordinator
// is notified and returns it for more information, the Organiser resubmits, and the Coordinator approves,
// which cancels the event and notifies the Organiser. Firebase is the in-memory double; the API and app are
// real. The seeded event starts 20 Nov 2026, so this spec relies on the real clock being before then.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test, approveVenueForEvent } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const statusPill = (page) => page.locator('.page-heading .status-pill')
const dialog = (page) => page.getByRole('group', { name: 'Confirm status change' })

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

async function actAs(request, account, id, action) {
  const response = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${id}/transitions`, {
    headers: { Authorization: `Bearer test-token:${account.uid}` },
    data: { action },
  })
  expect(response.ok(), `${account.uid} ${action}`).toBeTruthy()
}

test.describe('SPM-47 — Organiser requests cancellation (E2E)', () => {
  test('spm47_request_return_resubmit_and_approve_with_notifications', async ({ page }) => {
    await approveVenueForEvent(page.request, planning.id)
    await actAs(page.request, ROLE_USERS.technicalStaff, planning.id, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, planning.id, 'confirm')

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('button', { name: 'Request cancellation' }).click()
    await expect(dialog(page).getByRole('button', { name: 'Request cancellation' })).toBeDisabled()
    await page.getByLabel('Reason (required)').fill('Keynote speaker withdrew')
    await dialog(page).getByRole('button', { name: 'Request cancellation' }).click()
    await expect(page.getByText(/awaiting the event coordinator/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request cancellation' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/notifications')
    await expect(page.getByText(`The organiser has requested cancellation of “${planning.core.title}”.`)).toBeVisible()
    await page.getByRole('link', { name: 'View event' }).click()
    await page.getByRole('button', { name: 'Return cancellation request' }).click()
    await page.getByLabel('Message to the organiser (required)').fill('Which sessions are affected?')
    await dialog(page).getByRole('button', { name: 'Return cancellation request' }).click()
    await expect(page.getByText(/needs more information/)).toBeVisible()
    await expect(statusPill(page)).toHaveText('Confirmed')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByText('Which sessions are affected?')).toBeVisible()
    await page.getByRole('button', { name: 'Resubmit cancellation request' }).click()
    await page.getByLabel('Updated reason (required)').fill('All afternoon sessions')
    await dialog(page).getByRole('button', { name: 'Resubmit cancellation request' }).click()
    await expect(page.getByText(/awaiting the event coordinator/)).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByText('All afternoon sessions')).toBeVisible()
    await page.getByRole('button', { name: 'Approve cancellation' }).click()
    await dialog(page).getByRole('button', { name: 'Approve cancellation' }).click()
    await expect(statusPill(page)).toHaveText('Cancelled')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto('/notifications')
    await expect(page.getByText(`Your cancellation request was approved. “${planning.core.title}” has been cancelled.`)).toBeVisible()
  })
})
