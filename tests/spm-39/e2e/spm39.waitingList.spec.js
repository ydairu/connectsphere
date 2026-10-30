// SPM-39 end-to-end in Chromium: two Attendees fill the seeded two-place event; the third is told it is full, is
// offered the waiting list, confirms joining and is told their position, which "My registrations" also shows; the
// owning Organiser sees one person waiting. Firebase is the in-memory double; the API and app are real.
//
// Date risk: registration on the seeded two-place event closes 25 Nov 2026 (as in the SPM-19 spec).

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const event = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed-small')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-39 — join the waiting list of a full event (E2E)', () => {
  test('spm39_an_attendee_joins_the_waiting_list_of_a_full_event_and_sees_their_position', async ({ page }) => {
    for (const account of [ROLE_USERS.attendee, EXTRA_USERS.secondAttendee]) {
      const registered = await page.request.post(`${DOUBLE_ORIGIN}/api/requests/${event.id}/registrations`, {
        headers: { Authorization: `Bearer test-token:${account.uid}` },
      })
      expect(registered.status(), account.uid).toBe(201)
    }

    await signIn(page, EXTRA_USERS.thirdAttendee)
    await page.goto(`/requests/${event.id}`)
    const card = page.getByRole('region', { name: 'Registration' })
    await expect(card.getByText('This event is full.')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Join waiting list' }).click()
    await card.getByRole('group', { name: 'Confirm joining the waiting list' }).getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByRole('status', { name: 'On the waiting list' })).toContainText('You are number 1 on the waiting list.')

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My registrations' }).click()
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText('Status: Waitlisted, position 1')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${event.id}`)
    const registrations = page.getByRole('region', { name: 'Registrations' })
    await expect(registrations).toContainText('2 registered of 2 places')
    await expect(registrations).toContainText('1 on the waiting list')
  })
})
