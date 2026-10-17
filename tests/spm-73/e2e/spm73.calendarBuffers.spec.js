// SPM-73 end to end — a Coordinator opens the seeded hall's availability calendar (setup 30, turnaround
// 45) and sees A1's confirmed booking with its setup and turnaround either side. The period is two days
// wide so the booking (20 Nov, 09:00–13:00 Singapore time) falls inside it in any browser time zone.

import { expect, test, ROLE_USERS, loginAs } from '../../shared/e2e/fixtures.js'

test('spm73_coordinator_sees_setup_and_turnaround_around_a_booking_on_the_calendar', async ({ page }) => {
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)

  await page.goto('/venues/seed-venue-hall/availability')
  await expect(page.getByRole('heading', { name: 'Seed Hall (setup 30, turnaround 45)' })).toBeVisible()
  // The end first, so the period stays valid while it is changed.
  await page.getByLabel('To', { exact: true }).fill('2026-11-21T12:00')
  await page.getByLabel('From', { exact: true }).fill('2026-11-19T12:00')

  const slots = page.getByRole('list', { name: 'Availability slots' }).getByRole('listitem')
  await expect(slots.filter({ hasText: 'A1 confirmed (registration open)' })).toHaveCount(3)
  await expect(slots.locator('strong')).toHaveText(['Available', 'Setup', 'Confirmed booking', 'Turnaround', 'Available'])
  await expect(page.getByText('Before A1 confirmed (registration open)')).toBeVisible()
  await expect(page.getByText('After A1 confirmed (registration open)')).toBeVisible()
  await expect(
    page.getByText('This venue needs 30 minutes of setup before and 45 minutes of turnaround after each booking or hold. Those periods are unavailable.'),
  ).toBeVisible()
})
