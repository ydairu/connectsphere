// SPM-45 end-to-end in Chromium: the assigned Coordinator rejects a request Under Review with a reason; the
// Organiser sees it marked Rejected and closed, with the reason, under Closed events, and is pointed to a new
// request. Venue Staff cannot reject the overall event. Firebase is the in-memory double; the API and app are
// real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const underReview = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-under-review')
const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const REASON = 'No available venue can hold the expected attendance on that date'
const statusPill = (page) => page.locator('.page-heading .status-pill')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-45 — Coordinator rejects an event request (E2E)', () => {
  test('spm45_coordinator_rejects_with_a_reason_and_the_organiser_sees_it_closed', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${underReview.id}`)
    await expect(statusPill(page)).toHaveText('Under review')
    await page.getByRole('button', { name: 'Reject request' }).click()
    const dialog = page.getByRole('group', { name: 'Confirm status change' })
    await expect(dialog.getByRole('button', { name: 'Reject request' })).toBeDisabled()
    await expect(page.getByText('Enter a rejection reason to continue.')).toBeVisible()
    await page.getByLabel('Rejection reason (required)').fill(REASON)
    await dialog.getByRole('button', { name: 'Reject request' }).click()
    await expect(statusPill(page)).toHaveText('Rejected')
    await expect(page.getByRole('heading', { name: 'Request rejected' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto('/requests')
    await page.getByRole('region', { name: 'Closed events' }).locator('li', { hasText: underReview.core.title }).getByRole('link', { name: 'View' }).click()
    await expect(statusPill(page)).toHaveText('Rejected')
    await expect(page.getByText('This request is closed. It cannot be edited or resubmitted.')).toBeVisible()
    await expect(page.getByText(REASON)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resubmit request' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await page.getByRole('link', { name: 'create a new event request' }).click()
    await expect(page).toHaveURL(/\/event-requests\/new$/)
  })

  test('spm45_venue_staff_are_not_offered_reject_and_the_api_refuses_it', async ({ page }) => {
    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByRole('button', { name: 'Reject venue arrangement' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject request' })).toHaveCount(0)

    const response = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests/${planning.id}/transitions`, {
      headers: { Authorization: `Bearer test-token:${ROLE_USERS.venueStaff.uid}` },
      data: { action: 'reject', reason: REASON },
    })
    expect(response.status()).toBe(403)
    await page.reload()
    await expect(statusPill(page)).toHaveText('Planning')
  })
})
