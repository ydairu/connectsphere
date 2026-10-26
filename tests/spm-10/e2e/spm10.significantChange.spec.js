// SPM-10 end-to-end in Chromium: on the seeded Confirmed event (both sign-offs approved), its Coordinator
// changes the expected attendance, confirms the in-page warning, and sees the event back in Planning with
// both sign-offs Awaiting approval and the history entry marked Significant. The assigned Venue Staff then
// see the in-app notification and a read-only Venue preparation card. Firebase is the in-memory double; the
// API and app are real.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const confirmed = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed')
// A1's confirmed event belongs to Seed Coordinator 3, registered with the double for this test only.
const COORDINATOR = SEED_ACCOUNTS.coordinator3

const statusPill = (page) => page.locator('.page-heading .status-pill')
const arrangement = (page, name) => page.getByText(name, { exact: true }).locator('xpath=following-sibling::*[1]')

test.describe('SPM-10 — Edit event information and flag significant changes for re-review (E2E)', () => {
  test('spm10_coordinator_changes_attendance_on_a_confirmed_event_and_it_returns_to_planning', async ({ page, request }) => {
    expect(confirmed.assignedCoordinatorUid).toBe(COORDINATOR.uid)
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/coordinator3`)).ok()).toBeTruthy()

    await signIn(page, COORDINATOR)
    await page.goto(`/requests/${confirmed.id}`)
    await expect(statusPill(page)).toHaveText('Confirmed')
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Awaiting approval')

    await page.getByLabel('Expected attendees').fill('150')
    await page.getByRole('button', { name: 'Save changes' }).click()

    const dialog = page.getByRole('alertdialog', { name: 'Confirm significant change' })
    await expect(dialog).toContainText('moves the event back to Planning')
    await dialog.getByRole('button', { name: 'Save and reset sign-offs' }).click()

    await expect(page.getByText('Changes saved.')).toBeVisible()
    await expect(statusPill(page)).toHaveText('Planning')
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Awaiting approval')
    await expect(arrangement(page, 'Technical arrangement')).toHaveText('Awaiting approval')
    await page.getByRole('tab', { name: 'Change Log' }).click()
    const row = page.getByRole('list', { name: 'Change history entries' }).getByRole('listitem', { name: 'Event details · Expected attendees' })
    await expect(row).toContainText('Significant')
    await expect(row).toContainText('80 → 150')

    await logout(page)
    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto('/notifications')
    const notice = page.getByRole('heading', { name: /has had a significant change/ })
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(confirmed.core.title)
    await expect(notice).toContainText('Expected attendees')
    await expect(notice).toContainText('moved back to Planning')

    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    const card = page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Venue preparation' }) })
    await expect(card.getByText('Read only')).toBeVisible()
    await expect(card.getByText('Available once the event is in Preparation.')).toBeVisible()
    await expect(page.getByLabel('Venue preparation status')).toHaveCount(0)
  })
})
