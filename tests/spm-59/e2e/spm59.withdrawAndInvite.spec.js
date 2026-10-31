// SPM-59 end-to-end in Chromium: on the seeded two-place event (withdrawal allowed), two Attendees take the places and
// a third joins the waiting list. One withdraws from the event page after confirming and sees it as Withdrawn; the
// waiting Attendee is invited, follows the notice and accepts the place. Firebase is the in-memory double; the API
// and app are real.
//
// Date risk: registration on the seeded two-place event closes 25 Nov 2026 (as in the SPM-19 spec).

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const event = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed-small')
const auth = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-59 — withdraw and release the place to the waiting list (E2E)', () => {
  test('spm59_an_attendee_withdraws_and_the_waiting_attendee_accepts_the_invitation', async ({ page }) => {
    for (const account of [ROLE_USERS.attendee, EXTRA_USERS.secondAttendee]) {
      expect((await page.request.post(`${DOUBLE_ORIGIN}/api/requests/${event.id}/registrations`, { headers: auth(account) })).status(), account.uid).toBe(201)
    }
    expect((await page.request.post(`${DOUBLE_ORIGIN}/api/requests/${event.id}/waiting-list`, { headers: auth(EXTRA_USERS.thirdAttendee) })).status()).toBe(201)

    await signIn(page, ROLE_USERS.attendee)
    await page.goto(`/requests/${event.id}`)
    const card = page.getByRole('region', { name: 'Registration' })
    await card.getByRole('button', { name: 'Withdraw registration' }).click()
    await card.getByRole('group', { name: 'Confirm withdrawal' }).getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByRole('status', { name: 'Registration withdrawn' })).toContainText(`You have withdrawn from ${event.core.title}.`)
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My registrations' }).click()
    await expect(page.getByRole('list', { name: 'My registrations' })).toContainText('Status: Withdrawn')
    await logout(page)

    await signIn(page, EXTRA_USERS.thirdAttendee)
    await page.goto('/notifications')
    const notice = page.getByRole('listitem').filter({ hasText: `A place is available for “${event.core.title}”` })
    await expect(notice).toContainText('Accept by:')
    await notice.getByRole('link', { name: 'View invitation' }).click()
    await expect(page.getByRole('status', { name: 'Invitation' })).toContainText('A place is available.')
    await page.getByRole('button', { name: 'Accept place' }).click()
    await expect(page.getByRole('status', { name: 'Registration confirmed' })).toContainText(`You are registered for ${event.core.title}.`)
  })
})
