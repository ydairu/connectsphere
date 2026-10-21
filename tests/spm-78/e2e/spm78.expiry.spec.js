import { DOUBLE_ORIGIN, expect, test, ROLE_USERS, loginAs, logout } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const path = `/requests/${eventId}/venue-bookings`
const auth = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

async function createBooking(request, venueId) {
  const changed = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, {
    headers: auth(ROLE_USERS.coordinator.uid),
    data: { core: { preferredDateTime: '2027-03-01T10:00:00.000Z', durationHours: 2 } },
  })
  expect(changed.status()).toBe(200)
  const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
    headers: auth(ROLE_USERS.coordinator.uid),
    data: { venueId, startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', attendeeCount: venueId === 'seed-venue-room' ? 30 : 80, requirements: 'Theatre', submissionKey: crypto.randomUUID() },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).booking
}

async function setExpiry(request, bookingId, holdExpiresAt) {
  expect((await request.post(`${DOUBLE_ORIGIN}/__double__/venue-hold-expiry`, { data: { bookingId, holdExpiresAt } })).status()).toBe(204)
}

test('warning, expiry, notices, queue, calendar and search', async ({ page, request }) => {
  const booking = await createBooking(request, 'seed-venue-hall')
  const now = new Date()
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await setExpiry(request, booking.id, deadline.toISOString())
  const warning = await request.post(`${DOUBLE_ORIGIN}/__double__/process-venue-holds`, { data: { now: now.toISOString() } })
  expect(await warning.json()).toMatchObject({ warned: 1, expired: 1 }) // seeded standalone expired hold
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto('/notifications')
  await expect(page.getByText(/tentative hold.*expires at/)).toBeVisible()
  await page.goto(path)
  await page.getByRole('tab', { name: 'Requests' }).click()
  await expect(page.locator('summary')).toContainText('Under review')

  await setExpiry(request, booking.id, new Date(now.getTime() - 1000).toISOString())
  const lateApproval = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
    headers: auth(ROLE_USERS.venueStaff.uid), data: { action: 'approve' },
  })
  expect(lateApproval.status()).toBe(409)
  await page.reload()
  await page.getByRole('tab', { name: 'Requests' }).click()
  await expect(page.locator('summary')).toContainText('Expired')
  await page.locator('summary').click()
  await expect(page.getByText('This hold expired.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Replace request for Seed Hall/ })).toBeVisible()
  await page.goto('/venues/seed-venue-hall/availability')
  await page.getByLabel('To', { exact: true }).fill('2027-03-01T13:00')
  await page.getByLabel('From', { exact: true }).fill('2027-03-01T09:00')
  await expect(page.getByRole('list', { name: 'Availability slots' }).locator('strong')).toHaveText(['Available'])
  await page.goto('/venues')
  await page.getByLabel('Available from').fill('2027-03-01T10:00')
  await page.getByLabel('Available to').fill('2027-03-01T12:00')
  await page.getByRole('button', { name: 'Search available venues' }).click()
  await expect(page.getByText('Seed Hall (setup 30, turnaround 45)')).toBeVisible()

  const expired = await request.post(`${DOUBLE_ORIGIN}/__double__/process-venue-holds`, { data: { now: now.toISOString() } })
  expect(await expired.json()).toMatchObject({ warned: 0, expired: 1 })
  const retry = await request.post(`${DOUBLE_ORIGIN}/__double__/process-venue-holds`, { data: { now: now.toISOString() } })
  expect(await retry.json()).toMatchObject({ warned: 0, expired: 0 })
  await page.goto('/notifications')
  await expect(page.getByText(/tentative hold.*has expired/)).toHaveCount(1)
  await logout(page)
  await loginAs(page, ROLE_USERS.venueStaff)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto('/venues/booking-requests')
  await expect(page.getByText('No pending booking requests.')).toBeVisible()
  await logout(page)
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`/requests/${eventId}`)
  await expect(page.locator('.status-pill').first()).toContainText('Planning')
})

test('approval before expiry remains confirmed after the deadline', async ({ page, request }) => {
  const booking = await createBooking(request, 'seed-venue-hall')
  const deadline = new Date(Date.now() + 60 * 60 * 1000)
  await setExpiry(request, booking.id, deadline.toISOString())
  const approval = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
    headers: auth(ROLE_USERS.venueStaff.uid), data: { action: 'approve' },
  })
  expect(approval.status()).toBe(200)
  const run = await request.post(`${DOUBLE_ORIGIN}/__double__/process-venue-holds`, { data: { now: new Date(deadline.getTime() + 60 * 60 * 1000).toISOString() } })
  expect(await run.json()).toMatchObject({ warned: 0, expired: 1 }) // seeded standalone expired hold
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`${path}?bookingId=${booking.id}`)
  await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
  await page.goto('/venues/seed-venue-hall/availability')
  await page.getByLabel('To', { exact: true }).fill('2027-03-01T13:00')
  await page.getByLabel('From', { exact: true }).fill('2027-03-01T09:00')
  await expect(page.getByRole('list', { name: 'Availability slots' }).locator('strong')).toHaveText(['Available', 'Setup', 'Confirmed booking', 'Turnaround', 'Available'])
})
