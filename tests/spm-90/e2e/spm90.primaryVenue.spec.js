import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const coordinator = ROLE_USERS.coordinator
const auth = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

test('Coordinator selects a primary venue; Attendee sees only that location and Organiser sees both bookings', async ({ page, request }) => {
  const patch = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(coordinator.uid), data: {
    core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 },
    equipment: { requirements: [], technicalSupportNeeded: false }, registration: { enabled: true },
  } })
  expect(patch.status(), await patch.text()).toBe(200)
  const submit = async (venueId, attendeeCount, submissionKey) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
      headers: auth(coordinator.uid), data: { venueId, startsAt: '2027-03-01T10:00:00Z',
        endsAt: '2027-03-01T12:00:00Z', attendeeCount, requirements: 'Theatre layout', submissionKey },
    })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()).booking
  }
  const hall = await submit('seed-venue-hall', 80, 'spm90-hall')
  const room = await submit('seed-venue-room', 30, 'spm90-room')
  for (const booking of [hall, room]) {
    const actor = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff]
      .find((account) => account.name === booking.assignedVenueStaffName)
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
      headers: auth(actor.uid), data: { action: 'approve' },
    })
    expect(response.status(), await response.text()).toBe(200)
  }
  expect((await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${eventId}/transitions`, {
    headers: auth(coordinator.uid), data: { action: 'confirm' },
  })).status()).toBe(409)

  await loginAs(page, coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  const hallCard = page.getByRole('region', { name: /^Booking for Seed Hall/ })
  await hallCard.getByRole('button', { name: 'Set as primary venue' }).click()
  await expect(hallCard.getByText('Primary venue')).toBeVisible()
  await page.getByRole('tab', { name: 'Event Status' }).click()
  await page.getByRole('button', { name: 'Confirm event' }).click()
  await expect(page.locator('.page-heading .status-pill')).toHaveText('Confirmed')
  await logout(page)

  await loginAs(page, ROLE_USERS.attendee)
  await page.goto('/requests')
  await expect(page.getByText(/^Location: Seed Hall.*Level 1, Main Campus/)).toBeVisible()
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(page.getByText('Seed Hall')).toBeVisible()
  await expect(page.getByText('Level 1, Main Campus')).toBeVisible()
  await expect(page.getByText('Seed Breakout')).toHaveCount(0)
  await logout(page)

  await loginAs(page, ROLE_USERS.organiser)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(page.getByRole('region', { name: /^Booking for Seed Hall/ })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Booking for Seed Breakout/ })).toBeVisible()
  await expect(page.getByText('Primary venue')).toBeVisible()
})
