// SPM-5 end-to-end in Chromium: the assigned Coordinator opens a Submitted request, reviews its details,
// starts review and approves it for Planning; another Coordinator cannot open it. Firebase is the in-memory
// double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const submitted = SEED_REQUESTS.find(
  (request) =>
    request.status === SUBMITTED &&
    request.ownerUid === ROLE_USERS.organiser.uid &&
    request.assignedCoordinatorUid === ROLE_USERS.coordinator.uid,
)

const statusPill = (page) => page.locator('.page-heading .status-pill')

test.describe('SPM-5 — Review a request and approve it for Planning (E2E)', () => {
  test('spm5_assigned_coordinator_reviews_the_details_and_approves_for_planning', async ({ page }) => {
    expect(submitted).toBeDefined()

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${submitted.id}`)
    await expect(statusPill(page)).toHaveText('Submitted')

    // The review inputs.
    await expect(page.getByLabel('Title')).toHaveValue(submitted.core.title)
    await expect(page.getByLabel('Expected attendees')).toHaveValue(String(submitted.core.expectedAttendees))
    await expect(page.getByLabel('Duration (hours)')).toHaveValue(String(submitted.core.durationHours))
    await expect(page.getByLabel('Preferred date and time')).not.toHaveValue('')
    await expect(page.getByLabel('Layout preference')).toHaveValue(submitted.venue.layoutPreference)
    await expect(page.getByLabel('Accessibility required')).toBeChecked()
    await expect(page.getByLabel('Equipment required (one per line)')).toHaveValue(submitted.equipment.requirements.join('\n'))

    // Opening the page alone does not change the status; starting review does.
    await expect(page.getByRole('button', { name: 'Approve for planning' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Start review' }).click()
    await expect(statusPill(page)).toHaveText('Under review')

    await page.getByRole('button', { name: 'Approve for planning' }).click()
    await expect(statusPill(page)).toHaveText('Planning')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(statusPill(page)).toHaveText('Planning')
  })

  // The E2E double signs in only the test accounts, so this uses the SPM-65 direction: the test Coordinator
  // opens a request awaiting review that is assigned to a different Coordinator.
  test('spm5_another_coordinator_cannot_open_the_request_to_act_on_it', async ({ page }) => {
    const othersRequest = SEED_REQUESTS.find(
      (request) =>
        [SUBMITTED, UNDER_REVIEW].includes(request.status) &&
        request.assignedCoordinatorUid &&
        request.assignedCoordinatorUid !== ROLE_USERS.coordinator.uid,
    )
    expect(othersRequest).toBeDefined()

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${othersRequest.id}`)
    await expect(page.getByText('This request no longer exists.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Approve for planning' })).toHaveCount(0)
  })
})
