// SPM-26 end-to-end in Chromium: the assigned Coordinator reassigns a submitted event to a second
// Coordinator after confirming the offline agreement, lands on their list without it, and can no longer
// open it; the new Coordinator sees and opens it. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { COMPLETED, SUBMITTED } from '../../../shared/status.js'
import { EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const FROM = ROLE_USERS.coordinator
const TO = EXTRA_USERS.secondCoordinator

const submitted = SEED_REQUESTS.find(
  (request) => request.status === SUBMITTED && request.ownerUid === ROLE_USERS.organiser.uid && request.assignedCoordinatorUid === FROM.uid,
)
const completed = SEED_REQUESTS.find((request) => request.status === COMPLETED && request.assignedCoordinatorUid === FROM.uid)
const AGREED = 'The handover was agreed with the new Coordinator outside the system'

test.describe('SPM-26 — Reassign an event to a different Coordinator (E2E)', () => {
  test('spm26_assigned_coordinator_reassigns_and_the_event_moves_to_the_new_coordinator', async ({ page }) => {
    expect(submitted).toBeDefined()

    await signIn(page, TO)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: submitted.core.title, exact: true })).toHaveCount(0)
    await logout(page)

    await signIn(page, FROM)
    await page.goto(`/requests/${submitted.id}`)
    await page.getByRole('button', { name: 'Reassign coordinator' }).click()
    const form = page.getByRole('group', { name: 'Reassign coordinator' })
    const select = form.getByLabel('New Event Coordinator')
    await expect(select.locator('option')).toHaveText(['Choose a Coordinator', TO.name])

    await select.selectOption({ label: TO.name })
    await expect(form.getByRole('button', { name: 'Reassign event' })).toBeDisabled()
    await form.getByLabel(AGREED).check()
    await form.getByRole('button', { name: 'Reassign event' }).click()

    // The former Coordinator is taken to their list, which no longer has the event.
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByRole('status')).toHaveText(`Event reassigned to ${TO.name}.`)
    await expect(page.getByRole('heading', { name: 'Events assigned to you', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: submitted.core.title, exact: true })).toHaveCount(0)

    // AC5: a direct link now shows not found.
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByText('This request no longer exists.')).toBeVisible()
    await logout(page)

    // AC4: the new Coordinator lists and opens it, with the status unchanged.
    await signIn(page, TO)
    await page.goto('/requests')
    await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: submitted.core.title, exact: true }) }).getByRole('link', { name: 'View' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${submitted.id}$`))
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toBeVisible()
  })

  test('spm26_reassign_is_not_offered_on_a_completed_event_or_to_the_organiser', async ({ page }) => {
    expect(completed).toBeDefined()

    await signIn(page, FROM)
    await page.goto(`/requests/${completed.id}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Completed')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
  })
})
