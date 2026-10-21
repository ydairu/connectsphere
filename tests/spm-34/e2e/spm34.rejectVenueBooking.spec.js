import { expect, test, ROLE_USERS, loginAs, logout } from '../../shared/e2e/fixtures.js'

const path = '/requests/seed-req-a1-planning/venue-bookings'

test('SPM-34 assigned staff rejects and Coordinator sees the reason, notice and replacement path', async ({ page, request }) => {
  const changed = await request.patch('http://127.0.0.1:5001/api/requests/seed-req-a1-planning', {
    headers: { Authorization: `Bearer test-token:${ROLE_USERS.coordinator.uid}` },
    data: { core: { preferredDateTime: '2027-03-01T10:00:00.000Z', durationHours: 2 } },
  })
  expect(changed.status()).toBe(200)
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(path)
  await page.getByLabel('Attendees using this venue').fill('30')
  await page.getByLabel('Venue', { exact: true }).selectOption('seed-venue-room')
  await page.getByLabel('Venue requirements', { exact: true }).fill('Theatre layout')
  await page.getByRole('button', { name: 'Submit booking request' }).click()
  await expect(page.getByRole('status')).toContainText('tentatively held')
  await logout(page)

  await loginAs(page, ROLE_USERS.venueStaff)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto('/venues/booking-requests')
  await page.getByRole('link', { name: 'View details' }).click()
  await page.getByRole('button', { name: 'Reject booking' }).click()
  await page.getByLabel('Rejection reason').fill('The layout cannot be supported')
  await page.getByLabel('Suggested alternative (optional)').fill('Use the hall')
  await page.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(page.getByText('The layout cannot be supported')).toBeVisible()
  await page.getByRole('link', { name: 'Back to pending bookings' }).click()
  await expect(page.getByText('No pending booking requests.')).toBeVisible()
  await logout(page)

  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto('/notifications')
  await expect(page.getByText('Reason: The layout cannot be supported')).toBeVisible()
  await page.getByRole('link', { name: 'View booking' }).click()
  await expect(page.getByText('Use the hall')).toBeVisible()
  await page.getByRole('link', { name: 'Back to event' }).click()
  await page.goto(path)
  await page.getByRole('tab', { name: 'Requests' }).click()
  await page.locator('summary').click()
  await page.getByRole('button', { name: /Replace request for Seed Breakout/ }).click()
  await page.getByLabel('Venue', { exact: true }).selectOption('seed-venue-hall')
  await page.getByRole('button', { name: 'Submit replacement' }).click()
  await expect(page.getByRole('status')).toContainText('submitted to Seed Venue Staff')
})
