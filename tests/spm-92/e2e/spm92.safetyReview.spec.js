// SPM-91 / SPM-92 / SPM-66 end-to-end in Chromium: once the arrangements are approved, the assigned Coordinator
// submits the seeded Planning event for safety review and it shows "Pending safety check" while staying in
// Planning; the Safety Officer finds it in their queue, sees the booked venue, completes the checklist and
// approves; the event leaves the queue, and the Coordinator can then confirm it. Firebase is the in-memory
// double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { SAFETY_CHECKLIST_ITEMS } from '../../../shared/safetyReview.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, approveVenueForEvent, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const heading = (page) => page.locator('.page-heading')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-91/92/66 — safety review (E2E)', () => {
  test('spm92_coordinator_submits_safety_officer_approves_from_the_queue_coordinator_confirms', async ({ page }) => {
    await approveVenueForEvent(page.request, planning.id)
    const technical = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests/${planning.id}/transitions`, {
      headers: { Authorization: `Bearer test-token:${ROLE_USERS.technicalStaff.uid}` },
      data: { action: 'approve_technical' },
    })
    expect(technical.ok()).toBeTruthy()

    // SPM-91: the Coordinator submits; the event shows "Pending safety check" and stays in Planning.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByRole('button', { name: 'Confirm event' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Submit for safety review' }).click()
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Submit for safety review' }).click()
    await expect(heading(page).getByText('Pending safety check')).toBeVisible()
    await expect(heading(page).locator('.status-pill')).toHaveText('Planning')
    await logout(page)

    // SPM-66: the Safety Officer reaches it through the queue, read-only, with the booked venue's details.
    await signIn(page, EXTRA_USERS.safetyOfficer)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'Safety-review queue' })).toBeVisible()
    await page.locator('li', { hasText: planning.core.title }).getByRole('link', { name: 'View' }).click()
    await expect(page.getByRole('heading', { name: 'Booked venues' })).toBeVisible()
    await expect(page.getByText('Operating hours (venue restriction)')).toBeVisible()
    await expect(page.getByText('You can view this request but cannot change it.')).toBeVisible()

    // SPM-92: complete the checklist and approve.
    for (const item of SAFETY_CHECKLIST_ITEMS) {
      await page.locator(`#safety-${item.id}-result`).selectOption('satisfactory')
    }
    await page.getByRole('radio', { name: 'Approve' }).check()
    await page.getByRole('button', { name: 'Record safety review' }).click()
    await expect(page.getByText('Safety review recorded: Approve.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No events awaiting a safety check' })).toBeVisible()
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByText('You do not have access to this request.')).toBeVisible()
    await logout(page)

    // The Coordinator sees the approval and can now confirm.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(heading(page).getByText('Safety approved')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm event' }).click()
    await expect(heading(page).locator('.status-pill')).toHaveText('Confirmed')
  })
})
