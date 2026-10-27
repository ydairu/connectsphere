import { DOUBLE_ORIGIN, expect, test, ROLE_USERS, EXTRA_USERS, loginAs, recordSafetyApproval } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const path = `/requests/${eventId}/venue-bookings`
const auth = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

test('Coordinator resolves two venue needs independently before Confirm', async ({ page, request }) => {
  expect((await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, {
    headers: auth(ROLE_USERS.coordinator.uid),
    data: { core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 },
      equipment: { requirements: [], technicalSupportNeeded: false } },
  })).status()).toBe(200)
  await loginAs(page, ROLE_USERS.coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(path)
  await page.getByLabel('End', { exact: true }).fill('2027-03-01T11:00')
  await page.getByLabel('Attendees using this venue').fill('100')
  await page.getByLabel('Venue', { exact: true }).selectOption('seed-venue-hall')
  const hallResponse = page.waitForResponse((response) => response.url().endsWith('/venue-bookings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit booking request' }).click()
  const hall = (await (await hallResponse).json()).booking

  await page.getByRole('tab', { name: 'Submit a Request' }).click()
  await page.getByLabel('Start', { exact: true }).fill('2027-03-01T11:00')
  await page.getByLabel('End', { exact: true }).fill('2027-03-01T12:00')
  await page.getByLabel('Attendees using this venue').fill('30')
  await page.getByLabel('Venue', { exact: true }).selectOption('seed-venue-room')
  const roomResponse = page.waitForResponse((response) => response.url().endsWith('/venue-bookings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit booking request' }).click()
  const room = (await (await roomResponse).json()).booking
  expect(hall.venueNeedId).not.toBe(room.venueNeedId)
  await expect(page.locator('summary')).toContainText(['Under review', 'Under review'])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })

  const queues = await Promise.all([ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff].map((actor) =>
    request.get(`${DOUBLE_ORIGIN}/api/venues/booking-requests`, { headers: auth(actor.uid) })))
  expect((await Promise.all(queues.map((response) => response.json()))).flatMap((result) => result.bookings.map((booking) => booking.id))).toEqual(expect.arrayContaining([hall.id, room.id]))
  const decide = (id, action, reason, actor = ROLE_USERS.venueStaff) => request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${id}/actions`, {
    headers: auth(actor.uid), data: { action, ...(reason ? { reason } : {}) },
  })
  expect((await decide(hall.id, 'approve')).status()).toBe(200)
  expect((await decide(room.id, 'reject', 'Room unavailable', EXTRA_USERS.venueTechnicalStaff)).status()).toBe(200)
  const blockedView = await request.get(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(ROLE_USERS.coordinator.uid) })
  expect((await blockedView.json()).availableActions).not.toContain('confirm')
  const confirm = () => request.post(`${DOUBLE_ORIGIN}/api/event-requests/${eventId}/transitions`, {
    headers: auth(ROLE_USERS.coordinator.uid), data: { action: 'confirm' },
  })
  expect((await confirm()).status()).toBe(409)
  await page.reload()
  await page.getByRole('tab', { name: 'Requests' }).click()
  await page.locator('summary').filter({ hasText: 'Seed Breakout' }).click()
  await page.getByRole('button', { name: /Replace request for Seed Breakout/ }).click()
  const replacementResponse = page.waitForResponse((response) => response.url().endsWith('/venue-bookings') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Submit replacement' }).click()
  const replacement = (await (await replacementResponse).json()).booking
  expect(replacement.venueNeedId).toBe(room.venueNeedId)
  expect((await confirm()).status()).toBe(409)
  expect((await decide(replacement.id, 'approve', null, EXTRA_USERS.venueTechnicalStaff)).status()).toBe(200)
  // SPM-91/92: Confirm also needs a safety approval, recorded through the double here.
  await recordSafetyApproval(request, eventId)
  const readyView = await request.get(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: auth(ROLE_USERS.coordinator.uid) })
  expect((await readyView.json()).availableActions).toContain('confirm')
  expect((await confirm()).status()).toBe(200)
})
