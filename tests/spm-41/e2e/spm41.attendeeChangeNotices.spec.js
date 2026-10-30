// SPM-41 end-to-end in Chromium: a registered Attendee is told when the Coordinator moves the event to a new date,
// and when the Coordinator cancels it, after which "My registrations" shows it as cancelled. Firebase is the
// in-memory double; the API and app are real.
//
// Date risk: registration on the seeded two-place event closes 25 Nov 2026 (as in the SPM-19 spec), so after that
// date the registration step fails. The cancellation also needs the real clock to be before the event start.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

const event = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed-small')
const auth = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

async function registerAttendee(request) {
  const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${event.id}/registrations`, { headers: auth(ROLE_USERS.attendee) })
  expect(response.status()).toBe(201)
}

async function signInAsAttendee(page) {
  await loginAs(page, ROLE_USERS.attendee)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-41 — registered Attendees hear about reschedules and cancellations (E2E)', () => {
  test('spm41_a_registered_attendee_is_told_the_new_date_and_time', async ({ page }) => {
    await registerAttendee(page.request)
    const moved = await page.request.patch(`${DOUBLE_ORIGIN}/api/requests/${event.id}`, {
      headers: auth(ROLE_USERS.coordinator),
      data: { core: { preferredDateTime: '2026-11-28T10:00:00.000Z' } },
    })
    expect(moved.status()).toBe(200)

    await signInAsAttendee(page)
    await page.goto('/notifications')
    const notice = page.getByRole('listitem').filter({ hasText: `“${event.core.title}”, which you registered for, has been rescheduled.` })
    await expect(notice).toContainText('New date and time:')
    await expect(notice).toContainText('Previously:')
    await notice.getByRole('link', { name: 'View my registrations' }).click()
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText('Event being rearranged')
  })

  test('spm41_a_registered_attendee_is_told_of_the_cancellation', async ({ page }) => {
    await registerAttendee(page.request)
    const cancelled = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests/${event.id}/transitions`, {
      headers: auth(ROLE_USERS.coordinator),
      data: { action: 'cancel', reason: 'The venue is no longer available' },
    })
    expect(cancelled.status()).toBe(200)

    await signInAsAttendee(page)
    await page.goto('/notifications')
    const notice = page.getByRole('listitem').filter({ hasText: `“${event.core.title}”, which you registered for, has been cancelled.` })
    await expect(notice).toBeVisible()
    await expect(notice).not.toContainText('The venue is no longer available')
    await notice.getByRole('link', { name: 'View my registrations' }).click()
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText('Event cancelled')
    await expect(page.getByRole('link', { name: 'View event' })).toHaveCount(0)
  })
})
