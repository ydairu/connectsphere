// SPM-63 end-to-end in Chromium: the assigned Coordinator cancels a Confirmed event with a reason; the
// Organiser and the assigned Venue Staff see the in-app notification, and the event moves to Closed events.
// Firebase is the in-memory double; the API and app are real. The seeded event starts 20 Nov 2026, so this
// spec relies on the real clock being before then.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test, approveVenueForEvent } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const REASON = 'Venue closed for urgent repairs'
const statusPill = (page) => page.locator('.page-heading .status-pill')

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

test.describe('SPM-63 — Coordinator cancels a Confirmed event (E2E)', () => {
  test('spm63_coordinator_cancels_with_a_reason_and_the_organiser_and_staff_are_notified', async ({ page }) => {
    await approveVenueForEvent(page.request, planning.id)
    await actAs(page.request, ROLE_USERS.technicalStaff, planning.id, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, planning.id, 'confirm')

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Confirmed')
    await page.getByRole('button', { name: 'Cancel event' }).click()
    const dialog = page.getByRole('group', { name: 'Confirm status change' })
    await expect(dialog.getByRole('button', { name: 'Cancel event' })).toBeDisabled()
    await expect(page.getByText('Enter a reason to continue.')).toBeVisible()
    await page.getByLabel('Reason (required)').fill(REASON)
    await dialog.getByRole('button', { name: 'Cancel event' }).click()
    await expect(statusPill(page)).toHaveText('Cancelled')
    await expect(page.getByRole('heading', { name: 'Event cancelled' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.getByRole('link', { name: 'Notifications' }).click()
    await expect(page.getByText(`“${planning.core.title}” has been cancelled by the event coordinator.`)).toBeVisible()
    await expect(page.getByText(`Reason: ${REASON}`)).toBeVisible()
    await page.goto('/requests')
    await expect(page.getByRole('region', { name: 'Closed events' }).getByText(planning.core.title)).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto('/notifications')
    await expect(page.getByText(`Reason: ${REASON}`)).toBeVisible()
  })
})
