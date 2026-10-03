// SPM-25 end-to-end in Chromium: the assigned Coordinator returns an Under Review request with a required
// message, the Organiser reads it, amends the request and resubmits it, and it is back in the Coordinator's
// list as Submitted. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { UNDER_REVIEW } from '../../../shared/status.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const underReview = SEED_REQUESTS.find(
  (request) =>
    request.status === UNDER_REVIEW &&
    request.ownerUid === ROLE_USERS.organiser.uid &&
    request.assignedCoordinatorUid === ROLE_USERS.coordinator.uid,
)

const MESSAGE = 'Please confirm the expected attendance.'
const statusPill = (page) => page.locator('.page-heading .status-pill')

test.describe('SPM-25 — Return a request for clarification (E2E)', () => {
  test('spm25_coordinator_returns_with_a_message_and_organiser_amends_and_resubmits', async ({ page }) => {
    expect(underReview).toBeDefined()

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${underReview.id}`)
    await expect(statusPill(page)).toHaveText('Under review')

    await page.getByRole('button', { name: 'Return for clarification' }).click()
    const dialog = page.getByRole('group', { name: 'Confirm status change' })
    await expect(dialog.getByRole('button', { name: 'Return for clarification' })).toBeDisabled()
    await page.getByLabel('Message to the organiser (required)').fill(MESSAGE)
    await dialog.getByRole('button', { name: 'Return for clarification' }).click()
    await expect(statusPill(page)).toHaveText('Returned for clarification')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${underReview.id}`)
    await expect(page.getByRole('status', { name: 'Clarification message' })).toHaveText(MESSAGE)
    await expect(page.getByText('Read only')).toHaveCount(0)

    const attendees = page.getByLabel('Expected attendees')
    await attendees.fill('150')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()

    await page.getByRole('button', { name: 'Resubmit request' }).click()
    await expect(statusPill(page)).toHaveText('Submitted')
    await expect(page.getByRole('heading', { name: 'Clarification history' })).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/requests')
    await expect(page.getByRole('listitem').filter({ hasText: underReview.core.title }).locator('.status-pill')).toHaveText('Submitted')
  })
})
