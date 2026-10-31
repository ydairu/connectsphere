// SPM-20 / SPM-40 end-to-end in Chromium: on the seeded Confirmed event, the Organiser requests a larger attendance
// and the event is unchanged. Its Coordinator sees the request flagged as significant, returns it; the Organiser
// modifies and resubmits; the Coordinator accepts. The event goes back to Planning, a new safety check is needed
// and the kept sign-off is marked for the Coordinator (SPM-87). Firebase is the in-memory double; the API and app
// are real.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const confirmed = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed')
const COORDINATOR = SEED_ACCOUNTS.coordinator3
const heading = (page) => page.locator('.page-heading')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

async function requestAttendance(page, value, button) {
  await page.getByRole('button', { name: button }).click()
  const form = page.getByRole('group', { name: 'Request a change' })
  await form.getByLabel('Expected attendees').fill(value)
  await form.getByRole('button', { name: /change request/ }).click()
  await expect(page.getByText('Your change request was sent to the event coordinator.')).toBeVisible()
}

test.describe('SPM-20 / SPM-40 — change requests (E2E)', () => {
  test('spm20_organiser_requests_coordinator_returns_then_accepts_and_the_event_returns_to_planning', async ({ page, request }) => {
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/coordinator3`)).ok()).toBeTruthy()

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${confirmed.id}`)
    await requestAttendance(page, '120', 'Request a change')
    await expect(heading(page).locator('.status-pill')).toHaveText('Confirmed')
    await expect(page.getByRole('list', { name: 'Requested changes' })).toContainText('80 → 120')
    await logout(page)

    await signIn(page, COORDINATOR)
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: /requested a significant change/ })).toBeVisible()
    await page.goto(`/requests/${confirmed.id}`)
    await expect(page.getByText('Significant change.', { exact: true })).toBeVisible()
    // Attendance can affect a venue, not the technical sign-off, and this seeded event has no venue booking.
    await expect(page.getByRole('group', { name: 'Assessment of the proposed change' })).toContainText('No recorded sign-off is affected.')
    await page.getByLabel('Message to the organiser (required to decline or return)').fill('Please keep it to 100.')
    await page.getByRole('button', { name: 'Return for modification' }).click()
    await expect(page.getByText('Change returned to the organiser for modification.')).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${confirmed.id}`)
    await expect(page.getByText('Please keep it to 100.')).toBeVisible()
    await requestAttendance(page, '100', 'Modify and resubmit')
    await logout(page)

    await signIn(page, COORDINATOR)
    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('button', { name: 'Accept change' }).click()
    await expect(page.getByText('Change accepted and saved.')).toBeVisible()
    await expect(heading(page).locator('.status-pill')).toHaveText('Planning')
    await expect(heading(page).getByText('Safety check required again')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Choose sign-offs to send back' })).toContainText('Technical arrangement — Changed since approval')
  })
})
