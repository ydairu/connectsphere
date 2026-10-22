// SPM-76 end to end — the assigned Coordinator has asked for two venues for the Planning event (A1). On the
// Recommendations tab each of those venues is checked on its own: the hall passes and is shown as suitable,
// while the breakout room fails on capacity and has its problem named.

import { expect, test, ROLE_USERS, loginAs } from '../../shared/e2e/fixtures.js'

const ORIGIN = 'http://127.0.0.1:5001'
const EVENT_ID = 'seed-req-a1-planning'
const HEADERS = { Authorization: `Bearer test-token:${ROLE_USERS.coordinator.uid}` }

// 1 March 2027, 18:00–20:00 Singapore time: free at both seeded venues.
const PERIOD = { startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z' }

test.beforeEach(async ({ request }) => {
  const moved = await request.patch(`${ORIGIN}/api/requests/${EVENT_ID}`, {
    headers: HEADERS,
    data: { core: { preferredDateTime: PERIOD.startsAt, durationHours: 2 } },
  })
  expect(moved.status()).toBe(200)
  for (const [venueId, attendeeCount, requirements] of [
    ['seed-venue-hall', 80, 'Theatre'],
    ['seed-venue-room', 30, 'Classroom'],
  ]) {
    const created = await request.post(`${ORIGIN}/api/requests/${EVENT_ID}/venue-bookings`, {
      headers: HEADERS,
      data: { venueId, ...PERIOD, attendeeCount, requirements, submissionKey: crypto.randomUUID() },
    })
    expect(created.status(), await created.text()).toBe(201)
  }
})

test('spm76_coordinator_sees_each_requested_venue_checked_separately_and_the_failing_ones_problems', async ({ page }) => {
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)

  await page.goto(`/requests/${EVENT_ID}/venue-bookings?tab=recommendations`)
  const eventVenues = page.getByRole('list', { name: 'Event venue suitability results' })
  const items = eventVenues.locator('.suitability-item')
  await expect(items).toHaveCount(2)

  const hall = items.filter({ hasText: 'Seed Hall (setup 30, turnaround 45)' })
  await expect(hall.locator('.suitability-badge')).toHaveText('Suitable')
  await expect(hall.getByText('Why it is unsuitable')).toHaveCount(0)

  const room = items.filter({ hasText: 'Seed Breakout Room' })
  await expect(room.locator('.suitability-badge')).toHaveText('Unsuitable')
  await expect(room.getByText("Expected attendance (80) is above this venue's capacity (40).")).toBeVisible()
})
