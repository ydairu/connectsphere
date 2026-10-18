import { DOUBLE_ORIGIN, expect, test, ROLE_USERS, loginAs, logout } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const path = `/requests/${eventId}/venue-bookings`
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

async function submit(page, venueId) {
  await page.goto(path)
  await page.getByLabel('Venue', { exact: true }).selectOption(venueId)
  await page.getByLabel('Start', { exact: true }).fill('2027-03-01T10:00')
  await page.getByLabel('End', { exact: true }).fill('2027-03-01T12:00')
  await page.getByLabel('Venue requirements', { exact: true }).fill('Theatre layout')
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/requests/${eventId}/venue-bookings`) && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit booking request' }).click()
  expect((await response).status()).toBe(201)
  const booking = (await (await response).json()).booking
  await expect(page.getByRole('status')).toContainText('tentatively held')
  return booking
}
async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test('SPM-54 staff approves one venue; Coordinator sees the booking, notice, calendar and availability', async ({ page }, testInfo) => {
  await signIn(page, ROLE_USERS.coordinator)
  const booking = await submit(page, 'seed-venue-hall')
  await submit(page, 'seed-venue-room')
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.goto('/venues/booking-requests')
  await page.getByRole('link', { name: 'View details' }).click()
  await page.getByRole('button', { name: 'Approve booking' }).click()
  await expect(page.getByRole('form', { name: 'Approve venue booking' })).toContainText('Seed Hall')
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await expect(page.getByText('Hold expiry', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('approved-booking-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('approved-booking-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('link', { name: 'Back to pending bookings' }).click()
  await expect(page.getByText('No pending booking requests.')).toBeVisible()
  await logout(page)

  await signIn(page, ROLE_USERS.coordinator)
  await page.goto('/notifications')
  await page.getByRole('link', { name: 'View booking' }).click()
  await expect(page).toHaveURL(new RegExp(`bookingId=${booking.id}$`))
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await page.goto(path)
  await expect(page.locator('.booking-row').filter({ hasText: 'Status' }).locator('strong')).toHaveText(['pending', 'Approved — venue confirmed'])
  await page.goto(`/requests/${eventId}`)
  await expect(page.locator('.status-pill').first()).toContainText('Planning')

  await page.goto('/venues/seed-venue-hall/availability')
  await page.getByLabel('To', { exact: true }).fill('2027-03-01T18:00')
  await page.getByLabel('From', { exact: true }).fill('2027-03-01T08:00')
  await expect(page.getByRole('list', { name: 'Availability slots' }).locator('strong')).toHaveText(['Available', 'Setup', 'Confirmed booking', 'Turnaround', 'Available'])
  await page.goto('/venues')
  await page.getByLabel('Available from').fill('2027-03-01T10:00')
  await page.getByLabel('Available to').fill('2027-03-01T12:00')
  const search = page.waitForResponse((r) => r.url().includes('/api/venues?') && r.request().method() === 'GET')
  await page.getByRole('button', { name: 'Search available venues' }).click()
  expect((await search).ok()).toBe(true)
  await expect(page.getByText('No matching venues')).toBeVisible()
})

test('SPM-54 stale staff page reloads after a decision from another tab', async ({ page, request }) => {
  await signIn(page, ROLE_USERS.coordinator)
  const booking = await submit(page, 'seed-venue-hall')
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.goto(`${path}?bookingId=${booking.id}`)
  await page.getByRole('button', { name: 'Approve booking' }).click()
  await expect(page.getByRole('button', { name: 'Confirm approval' })).toBeVisible()
  const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
    headers: { Authorization: `Bearer test-token:${ROLE_USERS.venueStaff.uid}` }, data: { action: 'approve' },
  })
  expect(response.status()).toBe(200)
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(page.getByRole('alert')).toContainText('Only a pending booking')
  await page.getByRole('button', { name: 'Reload booking' }).click()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve booking' })).toHaveCount(0)
})

test('SPM-54 capacity overflow is refused and the booking remains pending', async ({ page }) => {
  await signIn(page, ROLE_USERS.coordinator)
  const booking = await submit(page, 'seed-venue-room')
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.goto(`${path}?bookingId=${booking.id}`)
  await page.getByRole('button', { name: 'Approve booking' }).click()
  await expect(page.getByRole('button', { name: 'Confirm approval' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Approval blocked' })).toContainText("above this venue's capacity")
  await expect(page.getByText('pending', { exact: true })).toBeVisible()
})


test('SPM-54 rejected replacement refreshes corrected requirements and previews warnings', async ({ page, request }) => {
  const headers = { Authorization: `Bearer test-token:${ROLE_USERS.coordinator.uid}` }
  const edit = async (layoutPreference) => {
    const result = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers, data: { venue: { layoutPreference } } })
    expect(result.status()).toBe(200)
  }
  await edit('Breakkout Room')
  const originalResponse = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, { headers, data: {
    venueId: 'seed-venue-hall', startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z',
    requirements: 'Breakkout Room', specialRequests: 'Wheelchair', submissionKey: 'typo-regression',
  } })
  expect(originalResponse.status()).toBe(201)
  const original = (await originalResponse.json()).booking
  expect((await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${original.id}/actions`, {
    headers: { Authorization: `Bearer test-token:${ROLE_USERS.venueStaff.uid}` }, data: { action: 'reject', reason: 'Review layout' },
  })).status()).toBe(200)
  await signIn(page, ROLE_USERS.coordinator)
  await page.goto(path)
  await expect(page.getByText('Breakkout Room', { exact: true })).toBeVisible()
  await edit('Breakout Room')
  await page.getByRole('button', { name: 'Replace request for Seed Hall' }).click()
  await expect(page.getByLabel('Venue requirements', { exact: true })).toHaveValue(/Breakout Room/)
  await expect(page.getByLabel('Special requests')).toHaveValue('Wheelchair')
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/requests/${eventId}/venue-bookings`) && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit replacement' }).click()
  const replacement = (await (await saved).json()).booking
  await expect(page.getByRole('status')).toContainText('tentatively held')
  await expect(page.getByText('Breakkout Room', { exact: true })).toBeVisible()
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.goto(`${path}?bookingId=${replacement.id}`)
  await expect(page.getByRole('region', { name: 'Suitability warnings' })).toContainText('Booking requirements "Breakout Room')
  await page.getByRole('button', { name: 'Approve booking' }).click()
  await expect(page.getByRole('form', { name: 'Approve venue booking' })).toContainText('Booking requirements "Breakout Room')
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Warnings recorded at approval' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
})


test('SPM-54 staff warnings follow classroom entered in the booking form, not the unchanged event', async ({ page, request }) => {
  const headers = { Authorization: `Bearer test-token:${ROLE_USERS.coordinator.uid}` }
  expect((await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers, data: { core: { expectedAttendees: 20 }, venue: { layoutPreference: 'Breakkout Room' } } })).status()).toBe(200)
  await signIn(page, ROLE_USERS.coordinator)
  const original = await submit(page, 'seed-venue-room')
  expect((await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${original.id}/actions`, {
    headers: { Authorization: `Bearer test-token:${ROLE_USERS.venueStaff.uid}` }, data: { action: 'reject', reason: 'Revise layout' },
  })).status()).toBe(200)
  await page.reload()
  await page.getByRole('button', { name: /Replace request for Seed Breakout/ }).click()
  await expect(page.getByRole('button', { name: 'Submit replacement' })).toBeVisible()
  await page.getByLabel('Venue requirements', { exact: true }).fill('classroom')
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/requests/${eventId}/venue-bookings`) && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit replacement' }).click()
  const replacement = (await (await saved).json()).booking
  await expect(page.getByRole('status')).toContainText('tentatively held')
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.goto(`${path}?bookingId=${replacement.id}`)
  await expect(page.getByText('classroom', { exact: true })).toBeVisible()
  await expect(page.getByText(/Breakkout/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Approve booking' }).click()
  await expect(page.getByRole('button', { name: 'Confirm approval' })).toBeEnabled()
  await expect(page.getByRole('form', { name: 'Approve venue booking' })).not.toContainText('Breakkout')
  await expect(page.getByRole('form', { name: 'Approve venue booking' })).not.toContainText('do not exactly match')
  await page.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Breakkout/)).toHaveCount(0)
})
