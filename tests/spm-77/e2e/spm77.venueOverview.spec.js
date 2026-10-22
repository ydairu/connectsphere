import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const coordinator = ROLE_USERS.coordinator
const auth = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

test('Coordinator changes one booking; Organiser sees each venue and its next step', async ({ page, request }) => {
  expect((await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(coordinator.uid), data: {
    core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 },
    equipment: { requirements: [], technicalSupportNeeded: false },
  } })).status()).toBe(200)
  const submit = async (venueId, startsAt, endsAt, attendeeCount, submissionKey, replacesId = null) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
      headers: auth(coordinator.uid), data: { venueId, startsAt, endsAt, attendeeCount,
        requirements: 'Theatre layout', submissionKey, ...(replacesId ? { replacesId } : {}) },
    })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()).booking
  }
  const hall = await submit('seed-venue-hall', '2027-03-01T10:00:00Z', '2027-03-01T11:00:00Z', 80, 'spm77-hall')
  const room = await submit('seed-venue-room', '2027-03-01T11:00:00Z', '2027-03-01T12:00:00Z', 30, 'spm77-room')
  const approve = async (booking) => {
    const staff = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff]
      .find((account) => account.name === booking.assignedVenueStaffName)
    expect(staff).toBeTruthy()
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
      headers: auth(staff.uid), data: { action: 'approve' },
    })
    expect(response.status(), await response.text()).toBe(200)
  }
  await approve(hall)
  await approve(room)

  await loginAs(page, coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  const hallCard = page.getByRole('region', { name: 'Booking for Seed Hall' })
  const roomCard = page.getByRole('region', { name: 'Booking for Seed Breakout' })
  await expect(hallCard).toContainText('Approved')
  await expect(roomCard).toContainText('Approved')
  await hallCard.getByRole('link', { name: 'Manage this booking' }).click()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByRole('button', { name: 'Confirm booking cancellation' }).click()
  await expect(page.getByRole('status')).toContainText('Booking cancelled')
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(hallCard).toContainText('Cancelled')
  await expect(hallCard).toContainText('The Coordinator will arrange a replacement')
  await expect(roomCard).toContainText('Approved')

  const search = await request.get(`${DOUBLE_ORIGIN}/api/venues`, { headers: auth(coordinator.uid), params: {
    availableFrom: '2027-03-01T11:00:00Z', availableTo: '2027-03-01T12:00:00Z', attendance: '30',
  } })
  expect(search.status()).toBe(200)
  const available = (await search.json()).venues.map((venue) => venue.id)
  expect(available).toContain('seed-venue-hall')
  expect(available).not.toContain('seed-venue-room')

  const replacement = await submit('seed-venue-hall', '2027-03-01T10:00:00Z', '2027-03-01T11:00:00Z', 80, 'spm77-replacement', hall.id)
  expect(replacement.venueNeedId).toBe(hall.venueNeedId)
  await page.reload()
  await expect(hallCard).toContainText('Under review')
  await hallCard.getByText('Previous requests (1)').click()
  await expect(hallCard.getByText(/· Cancelled ·/)).toBeVisible()
  await expect(roomCard).toContainText('Approved')

  await logout(page)
  await loginAs(page, ROLE_USERS.organiser)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(hallCard).toContainText('Under review')
  await expect(roomCard).toContainText('Approved')
  await expect(hallCard).toContainText('Await Venue Staff review')
  await expect(page.getByRole('link', { name: 'Manage this booking' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Venue One')
})
