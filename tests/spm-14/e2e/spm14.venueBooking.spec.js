import { expect, test, ROLE_USERS, EXTRA_USERS, loginAs, logout } from '../../shared/e2e/fixtures.js'

const path = '/requests/seed-req-a1-planning/venue-bookings'
async function signIn(page, user) {
  await loginAs(page, user)
  await expect(page).toHaveURL(/\/profile$/)
}
async function fill(page, venue = 'seed-venue-room') {
  await page.getByLabel('Venue', { exact: true }).selectOption(venue)
  await page.getByLabel('Start', { exact: true }).fill('2027-03-01T10:00')
  await page.getByLabel('End', { exact: true }).fill('2027-03-01T12:00')
  await page.getByLabel('Venue requirements', { exact: true }).fill('Theatre with wheelchair access')
  await page.getByLabel('Special requests', { exact: true }).fill('Quiet room requested')
}

test('SPM-14 submit, capacity warning, conflict, replacement and staff queue', async ({ page }) => {
  await signIn(page, ROLE_USERS.coordinator)
  await page.goto(path)
  await fill(page)
  await expect(page.getByText(/exceeds venue capacity/)).toBeVisible()
  await page.getByRole('button', { name: 'Submit booking request', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Seed Venue Staff')
  // A new request for the already-held period cannot duplicate the hold.
  await page.getByRole('button', { name: 'Submit booking request', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('not available')
  await page.getByRole('button', { name: /Replace request for Seed Breakout/ }).click()
  await fill(page, 'seed-venue-hall')
  await page.getByRole('button', { name: 'Submit replacement', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('submitted to Seed Venue Staff')
  await logout(page)
  await signIn(page, ROLE_USERS.venueStaff)
  await page.getByRole('link', { name: 'Venue bookings', exact: true }).click()
  await expect(page.getByText('Seed Hall (setup 30, turnaround 45)', { exact: true })).toBeVisible()
  await expect(page.getByText('Quiet room requested')).toHaveCount(0)
  await page.getByRole('link', { name: 'View details' }).click()
  await expect(page.getByRole('heading', { name: 'Venue booking details', exact: true })).toBeVisible()
  await expect(page.getByText('Quiet room requested')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit booking request' })).toHaveCount(0)
  const retry = await page.request.post('http://127.0.0.1:5001/api/requests/seed-req-b1-planning/venue-bookings', {
    headers: { Authorization: `Bearer test-token:${EXTRA_USERS.secondCoordinator.uid}` },
    data: { venueId: 'seed-venue-room', startsAt: '2027-03-01T10:00:00', endsAt: '2027-03-01T12:00:00', requirements: 'Theatre', specialRequests: '', submissionKey: 'released-period' },
  })
  expect(retry.status()).toBe(201)
})

test('SPM-14 event rejection frees the held period', async ({ page }) => {
  await signIn(page, ROLE_USERS.coordinator)
  await page.goto(path)
  await fill(page)
  await page.getByRole('button', { name: 'Submit booking request', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('tentatively held')
  // Exercise the real transition API using this signed-in user's double identity.
  const response = await page.request.post('http://127.0.0.1:5001/api/event-requests/seed-req-a1-planning/transitions', {
    headers: { Authorization: `Bearer test-token:${ROLE_USERS.coordinator.uid}` },
    data: { action: 'reject', reason: 'Cannot meet event needs' },
  })
  expect(response.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit booking request' })).toHaveCount(0)
})
