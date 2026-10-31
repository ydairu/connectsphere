// SPM-10 with SPM-87 end-to-end in Chromium: on the seeded Confirmed event (technical sign-off approved), its
// Coordinator changes the expected attendance, confirms the in-page warning, and sees the event back in Planning
// with the technical sign-off kept but marked Changed since approval, and the history entry marked Significant.
// The Coordinator sends the technical sign-off back for re-approval. The assigned Venue Staff then see the
// in-app notification. Firebase is the in-memory double; the API and app
// are real.

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
    await expect(dialog).toContainText('moves back from Confirmed to Planning')
    await expect(dialog).toContainText('marks them Changed since approval')
    await dialog.getByRole('button', { name: 'Save significant change' }).click()

    await expect(page.getByText('Changes saved.')).toBeVisible()
    await expect(statusPill(page)).toHaveText('Planning')
    await expect(arrangement(page, 'Venue arrangement')).toHaveText('Awaiting approval')
    // SPM-87: kept, and marked for the Coordinator to decide.
    await expect(arrangement(page, 'Technical arrangement')).toHaveText('Approved')
    const review = page.getByRole('group', { name: 'Choose sign-offs to send back' })
    await review.getByLabel('Technical arrangement — Changed since approval').check()
    await review.getByRole('button', { name: 'Send selected back for re-approval' }).click()
    await expect(page.getByText('The selected sign-offs were sent back for re-approval.')).toBeVisible()
    await expect(page.getByText('Sent back for re-approval: Technical arrangement')).toBeVisible()
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
    await expect(page.getByRole('heading', { name: 'Venue preparation' })).toHaveCount(0)
    await expect(page.getByLabel('Venue preparation status')).toHaveCount(0)
  })
})
