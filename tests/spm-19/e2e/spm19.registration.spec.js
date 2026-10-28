// SPM-19 end-to-end in Chromium: two Attendees take the two places on the seeded event, the third is told it is
// full, the first finds the registration under "My registrations", and the owning Organiser sees both on the
// event page. Firebase is the in-memory double; the API and app are real.
//
// Date risk: the seeded event starts 26 Nov 2026 and its registration closes 25 Nov 2026, so after that date
// this spec fails on "Registration has closed", as the seeded cancellation specs do after 20 Nov.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const event = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed-small')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-19 — Attendee registration (E2E)', () => {
  test('spm19_attendees_fill_the_event_and_the_organiser_sees_who_registered', async ({ page }) => {
    await signIn(page, ROLE_USERS.attendee)
    await page.goto(`/requests/${event.id}`)
    const card = page.getByRole('region', { name: 'Registration' })
    await expect(card.getByText('2 places left.')).toBeVisible()
    await card.getByRole('button', { name: 'Register' }).click()
    const confirmation = page.getByRole('status', { name: 'Registration confirmed' })
    await expect(confirmation).toContainText(`You are registered for ${event.core.title}.`)
    await expect(confirmation).toContainText('Date and time:')
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My registrations' }).click()
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText(event.core.title)
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText('Status: Registered')
    await logout(page)

    // The second place is taken through the API, as another Attendee would.
    const second = await page.request.post(`${DOUBLE_ORIGIN}/api/requests/${event.id}/registrations`, {
      headers: { Authorization: `Bearer test-token:${EXTRA_USERS.secondAttendee.uid}` },
    })
    expect(second.status()).toBe(201)

    await signIn(page, EXTRA_USERS.thirdAttendee)
    await page.goto(`/requests/${event.id}`)
    await expect(page.getByRole('region', { name: 'Registration' }).getByText('This event is full.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Register' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${event.id}`)
    const registrations = page.getByRole('region', { name: 'Registrations' })
    await expect(registrations).toContainText('2 registered of 2 places')
    await expect(registrations.getByRole('list', { name: 'Registered attendees' })).toContainText(ROLE_USERS.attendee.email)
    await expect(registrations.getByRole('list', { name: 'Registered attendees' })).toContainText(EXTRA_USERS.secondAttendee.email)
  })
})
