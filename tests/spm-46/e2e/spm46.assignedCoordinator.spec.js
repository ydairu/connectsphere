// SPM-46 end-to-end in Chromium: the Organiser opens their submitted event and sees the assigned
// Coordinator's name; an Organiser of another organisation and the Coordinator see no Coordinator row.
// Firebase is the in-memory double; the API and app are real.
//
// This uses an event assigned to `coordinator`. Since SPM-26 the double also holds Seed Coordinator 2
// (EXTRA_USERS.secondCoordinator); the name after a real reassignment is checked end to end in
// tests/workflows/e2e/coordinatorReassignment.spec.js. "Unassigned" (SPM-68's wording, formerly "Not yet assigned")
// is checked end to end on the seeded unassigned request in tests/spm-68/e2e. "Name unavailable" needs a record the
// double cannot produce through the app, so it is covered in tests/spm-46/integration.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { SUBMITTED } from '../../../shared/status.js'
import { ROLE_USERS, expect, fillRegistration, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

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

const draft = SEED_REQUESTS.find((request) => request.status === 'draft' && request.ownerUid === ROLE_USERS.organiser.uid)

test.describe('SPM-46 — View the assigned Event Coordinator (E2E)', () => {
  test('spm46_organiser_sees_the_assigned_coordinator_name_on_their_event', async ({ page }) => {
    expect(submitted).toBeDefined()

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByRole('heading', { name: submitted.core.title })).toBeVisible()

    const row = page.locator('.profile-row', { hasText: 'Event Coordinator' })
    await expect(row.locator('strong')).toHaveText(ROLE_USERS.coordinator.name)
    // Name only: the uid and email never reach the page.
    await expect(page.locator('body')).not.toContainText(ROLE_USERS.coordinator.uid)
    await expect(page.locator('body')).not.toContainText(ROLE_USERS.coordinator.email)
  })

  test('spm46_draft_shows_no_coordinator', async ({ page }) => {
    expect(draft).toBeDefined()

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${draft.id}`)
    await expect(page).toHaveURL(new RegExp(`/event-requests/${draft.id}/edit$`))
    await expect(page.getByText('Event Coordinator', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Unassigned', { exact: true })).toHaveCount(0)
  })

  test('spm46_out_of_scope_organiser_and_the_coordinator_see_no_coordinator_row', async ({ page }) => {
    // A newly registered Organiser of another company: SPM-42 puts nothing of Organisation A in scope.
    await page.goto('/register')
    await page.getByRole('radio', { name: /Event Organiser/ }).click()
    await fillRegistration(page, { name: 'Other Organiser', email: 'spm46-other-organiser@example.test', password: 'Spm46-Test-Password!' })
    await page.getByLabel('Organisation name').fill('Other Company')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByRole('alert')).toHaveText('You do not have access to this request.')
    await expect(page.locator('body')).not.toContainText(ROLE_USERS.coordinator.name)
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByRole('heading', { name: submitted.core.title })).toBeVisible()
    await expect(page.locator('.profile-row', { hasText: 'Event Coordinator' })).toHaveCount(0)
  })
})
