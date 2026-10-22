import { DOUBLE_ORIGIN, expect, test, ROLE_USERS, EXTRA_USERS, loginAs } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const pageUrl = `/requests/${eventId}/venue-bookings`
const coordinator = ROLE_USERS.coordinator
const staff = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff]
const auth = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

test('one approved venue can be cancelled and replaced without releasing the other', async ({ page, request }) => {
  expect((await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(coordinator.uid), data: {
    core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 },
    equipment: { requirements: [], technicalSupportNeeded: false },
  } })).status()).toBe(200)
  const submit = async (venueId, attendeeCount, submissionKey) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
      headers: auth(coordinator.uid), data: { venueId, startsAt: '2027-03-01T10:00:00Z',
        endsAt: '2027-03-01T12:00:00Z', attendeeCount, requirements: 'Theatre layout', submissionKey },
    })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()).booking
  }
  const hall = await submit('seed-venue-hall', 80, 'spm81-hall')
  const room = await submit('seed-venue-room', 30, 'spm81-room')
  const approve = async (booking) => {
    const actor = staff.find((account) => account.name === booking.assignedVenueStaffName)
    expect(actor).toBeTruthy()
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
      headers: auth(actor.uid), data: { action: 'approve' },
    })
    expect(response.status(), await response.text()).toBe(200)
  }
  await approve(hall)
  await approve(room)
  await loginAs(page, coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`${pageUrl}?bookingId=${hall.id}`)
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByRole('form', { name: 'Cancel venue booking' })).toContainText('Seed Hall')
  await page.getByRole('button', { name: 'Confirm booking cancellation' }).click()
  await expect(page.getByRole('status')).toContainText('Booking cancelled')
  await expect(page.getByText('Released', { exact: true })).toBeVisible()
  await page.goto(pageUrl)
  await page.getByRole('tab', { name: 'Requests' }).click()
  await expect(page.locator('summary').filter({ hasText: 'Seed Hall' })).toContainText('Cancelled')
  await expect(page.locator('summary').filter({ hasText: 'Seed Breakout' })).toContainText('Approved')
  const bookings = await request.get(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, { headers: auth(coordinator.uid) })
  expect((await bookings.json()).bookings.find((booking) => booking.id === room.id).status).toBe('approved')
  const event = await request.get(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(coordinator.uid) })
  expect((await event.json()).availableActions).not.toContain('confirm')
  await page.locator('summary').filter({ hasText: 'Seed Hall' }).click()
  await page.getByRole('button', { name: 'Replace request for Seed Hall' }).click()
  const replacementResponse = page.waitForResponse((response) => response.url().endsWith('/venue-bookings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit replacement' }).click()
  const replacement = (await (await replacementResponse).json()).booking
  expect(replacement.venueNeedId).toBe(hall.venueNeedId)
  await approve(replacement)
  const ready = await request.get(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(coordinator.uid) })
  expect((await ready.json()).availableActions).toContain('confirm')
})
