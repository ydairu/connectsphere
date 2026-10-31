// SPM-87 end-to-end in Chromium: on the seeded Planning event with an approved venue booking and technical
// sign-off, the Coordinator saves a significant change; both sign-offs are kept and marked Changed since
// approval. The Coordinator sends only the venue booking back; its Venue Staff member finds it Awaiting
// re-approval in their queue and approves it again; the Coordinator can then send the event for its safety
// check. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, approveVenueForEvent, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const arrangement = (page, name) => page.getByText(name, { exact: true }).locator('xpath=following-sibling::*[1]')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-87 — the Coordinator decides which sign-offs need re-approval (E2E)', () => {
  test('spm87_only_the_chosen_venue_booking_goes_back_and_is_approved_again', async ({ page }) => {
    const booking = await approveVenueForEvent(page.request, planning.id)
    const venueStaff = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff].find((account) => account.name === booking.assignedVenueStaffName)
    const technical = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests/${planning.id}/transitions`, {
      headers: { Authorization: `Bearer test-token:${ROLE_USERS.technicalStaff.uid}` }, data: { action: 'approve_technical' },
    })
    expect(technical.ok()).toBeTruthy()

    // AC1: a significant change keeps both sign-offs and marks them.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await page.getByLabel('Expected attendees').fill('70')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByRole('alertdialog', { name: 'Confirm significant change' }).getByRole('button', { name: 'Save significant change' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Approved')
    await expect(arrangement(page, 'Technical arrangement')).toHaveText('Approved')
    await expect(page.getByRole('button', { name: 'Submit for safety review' })).toHaveCount(0)

    // AC2: only the venue booking goes back.
    const review = page.getByRole('group', { name: 'Choose sign-offs to send back' })
    await review.getByLabel(/Seed Breakout Room.* — Changed since approval/).check()
    await review.getByRole('button', { name: 'Send selected back for re-approval' }).click()
    await expect(page.getByText('The selected sign-offs were sent back for re-approval.')).toBeVisible()
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Awaiting approval')
    await expect(arrangement(page, 'Technical arrangement')).toHaveText('Approved')
    await logout(page)

    // The Venue Staff member re-approves it from their queue.
    await signIn(page, venueStaff)
    await page.goto('/venues/booking-requests')
    const queued = page.locator('.booking-card', { hasText: planning.core.title })
    await expect(queued.getByText('Awaiting re-approval')).toBeVisible()
    await queued.getByRole('link', { name: 'View details' }).click()
    await page.getByRole('button', { name: 'Approve booking' }).click()
    await page.getByRole('button', { name: 'Confirm approval' }).click()
    await expect(page.getByText(/Booking approved/)).toBeVisible()
    await logout(page)

    // AC4: with nothing Awaiting approval, the safety check can be requested.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Approved')
    await expect(page.getByText('Sent back for re-approval: Seed Breakout Room (no setup or turnaround)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit for safety review' })).toBeVisible()
  })
})
