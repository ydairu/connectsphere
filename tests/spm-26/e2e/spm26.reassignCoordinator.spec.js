// SPM-26 end-to-end in Chromium, as SPM-69 changed it: the Event Coordinator Lead reassigns a submitted event from
// its Coordinator to a second Coordinator; the Lead stays on the event, which names the new Coordinator; the former
// Coordinator can no longer open it; the new Coordinator sees and opens it. The assigned Coordinator is not
// offered Reassign. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { COMPLETED, SUBMITTED } from '../../../shared/status.js'
import { EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const FROM = ROLE_USERS.coordinator
const TO = EXTRA_USERS.secondCoordinator
const LEAD = EXTRA_USERS.coordinatorLead

const submitted = SEED_REQUESTS.find(
  (request) => request.status === SUBMITTED && request.ownerUid === ROLE_USERS.organiser.uid && request.assignedCoordinatorUid === FROM.uid,
)
const completed = SEED_REQUESTS.find((request) => request.status === COMPLETED && request.assignedCoordinatorUid === FROM.uid)

test.describe('SPM-26 — Reassign an event to a different Coordinator (E2E)', () => {
  test('spm26_lead_reassigns_and_the_event_moves_to_the_new_coordinator', async ({ page }) => {
    expect(submitted).toBeDefined()

    await signIn(page, TO)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'Events assigned to you', exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Loading requests' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: submitted.core.title, exact: true })).toHaveCount(0)
    await logout(page)

    await signIn(page, LEAD)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByLabel('Event Coordinator')).toHaveText(FROM.name)
    await page.getByRole('button', { name: 'Reassign coordinator' }).click()
    const form = page.getByRole('group', { name: 'Reassign coordinator' })
    const select = form.getByLabel('New Event Coordinator')
    await expect(select).toHaveValue('')
    await expect(select.locator(`option[value="${TO.uid}"]`)).toHaveText(new RegExp(`^${TO.name} · \\d+ active events?$`))
    await expect(select.locator(`option[value="${FROM.uid}"]`)).toHaveCount(0)
    await expect(form.getByRole('checkbox')).toHaveCount(0)

    await select.selectOption(TO.uid)
    await form.getByRole('button', { name: 'Reassign event' }).click()

    // SPM-69: the Lead stays on the event, which now names the new Coordinator.
    await expect(page.getByText(`Event reassigned to ${TO.name}.`)).toBeVisible()
    await expect(page.getByLabel('Event Coordinator')).toHaveText(TO.name)
    await logout(page)

    // AC5: the former Coordinator's direct link now shows not found.
    await signIn(page, FROM)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.getByText('This request no longer exists.')).toBeVisible()
    await logout(page)

    // AC4: the new Coordinator lists and opens it, with the status unchanged, and cannot reassign it.
    await signIn(page, TO)
    await page.goto('/requests')
    await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: submitted.core.title, exact: true }) }).getByRole('link', { name: 'View' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${submitted.id}$`))
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
  })

  test('spm26_reassign_is_not_offered_to_the_coordinator_the_organiser_or_on_a_completed_event', async ({ page }) => {
    expect(completed).toBeDefined()

    await signIn(page, FROM)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
    await logout(page)

    // A finished event has left the Lead's view (CL3 G8!C41: active events).
    await signIn(page, LEAD)
    await page.goto(`/requests/${completed.id}`)
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: completed.core.title })).toHaveCount(0)
  })
})
