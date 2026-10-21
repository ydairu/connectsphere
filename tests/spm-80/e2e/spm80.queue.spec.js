import { DOUBLE_ORIGIN, expect, test, ROLE_USERS, EXTRA_USERS, loginAs, logout } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const staffAccounts = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff]
const auth = (user) => ({ Authorization: `Bearer test-token:${user.uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

async function submitPair(request) {
  const changed = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, {
    headers: auth(ROLE_USERS.coordinator),
    data: { core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 } },
  })
  expect(changed.status()).toBe(200)
  const submit = async (venueId, startsAt, endsAt, attendeeCount) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
      headers: auth(ROLE_USERS.coordinator),
      data: { venueId, startsAt, endsAt, attendeeCount, requirements: 'Theatre layout', specialRequests: '', submissionKey: crypto.randomUUID() },
    })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()).booking
  }
  return [
    await submit('seed-venue-hall', '2027-03-01T10:00:00Z', '2027-03-01T11:00:00Z', 40),
    await submit('seed-venue-room', '2027-03-01T11:00:00Z', '2027-03-01T12:00:00Z', 30),
  ]
}

for (const action of ['approve', 'reject']) {
  test(`SPM-80 ${action} removes only the decided booking from assigned staff queues`, async ({ page, request }) => {
    const [hall, room] = await submitPair(request)
    const ownerOf = (booking) => staffAccounts.find((account) => account.name === booking.assignedVenueStaffName)
    const hallStaff = ownerOf(hall)
    const roomStaff = ownerOf(room)
    expect(hallStaff).toBeTruthy()
    expect(roomStaff).toBeTruthy()
    const queueUrl = '/venues/booking-requests'
    const heading = (booking) => `${booking.eventTitle} — ${booking.venueName}`
    const displayedTime = (value) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

    for (const [account, booking] of [[hallStaff, hall], [roomStaff, room]]) {
      await loginAs(page, account)
      await expect(page).toHaveURL(/\/profile$/)
      await page.goto(queueUrl)
      const card = page.locator('.booking-card').filter({ has: page.locator('summary', { hasText: heading(booking) }) })
      await expect(card).toBeVisible()
      await expect(card).toContainText(displayedTime(booking.startsAt))
      await expect(card).toContainText(displayedTime(booking.endsAt))
      await expect(card.getByRole('link', { name: 'View details' })).toHaveAttribute('href', `/requests/${eventId}/venue-bookings?bookingId=${booking.id}`)
      await logout(page)
    }

    await loginAs(page, hallStaff)
    await expect(page).toHaveURL(/\/profile$/)
    await page.goto(queueUrl)
    await page.locator('.booking-card').filter({ has: page.locator('summary', { hasText: heading(hall) }) })
      .getByRole('link', { name: 'View details' }).click()
    await expect(page).toHaveURL(new RegExp(`bookingId=${hall.id}$`))
    if (action === 'approve') {
      await page.getByRole('button', { name: 'Approve booking' }).click()
      await page.getByRole('button', { name: 'Confirm approval' }).click()
      await expect(page.getByText('Approved — venue confirmed')).toBeVisible()
    } else {
      await page.getByRole('button', { name: 'Reject booking' }).click()
      await page.getByLabel('Rejection reason').fill('Cannot support this layout')
      await page.getByRole('button', { name: 'Confirm rejection' }).click()
      await expect(page.getByText('Cannot support this layout')).toBeVisible()
    }
    await page.getByRole('link', { name: 'Back to pending bookings' }).click()
    await expect(page.locator('summary').filter({ hasText: heading(hall) })).toHaveCount(0)
    await logout(page)

    await loginAs(page, roomStaff)
    await expect(page).toHaveURL(/\/profile$/)
    await page.goto(queueUrl)
    await page.getByRole('button', { name: 'Refresh' }).click()
    const remaining = page.locator('.booking-card').filter({ has: page.locator('summary', { hasText: heading(room) }) })
    await expect(remaining).toBeVisible()
    await expect(remaining).toContainText(displayedTime(room.startsAt))
    await expect(remaining).toContainText(displayedTime(room.endsAt))
    await expect(remaining.getByRole('link', { name: 'View details' })).toHaveAttribute('href', `/requests/${eventId}/venue-bookings?bookingId=${room.id}`)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
