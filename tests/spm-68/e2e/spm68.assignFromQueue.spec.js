// SPM-68 end-to-end in Chromium: the Organiser sees "Unassigned" on their submitted request; the Event Coordinator
// Lead opens the Unassigned requests queue, picks a Coordinator (shown with their active events) and confirms; the
// request leaves the queue, the Coordinator finds it under "Events assigned to you", and the Organiser sees the
// Coordinator's name. Firebase is the in-memory double; the API and app are real.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const LEAD = EXTRA_USERS.coordinatorLead
const COORDINATOR = EXTRA_USERS.secondCoordinator
const ORGANISER = SEED_ACCOUNTS.organiserA2
const unassigned = SEED_REQUESTS.find((request) => request.id === 'seed-req-a2-unassigned')

test.describe('SPM-68 — the Event Coordinator Lead assigns a request from the unassigned queue (E2E)', () => {
  test('spm68_lead_assigns_the_queued_request_and_the_coordinator_sees_it', async ({ page, request }) => {
    expect(unassigned).toBeDefined()
    expect(unassigned.assignedCoordinatorUid).toBeNull()
    // organiser-a2 is not one of the default E2E accounts; the double signs it in for this test.
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/organiserA2`)).ok()).toBeTruthy()

    // AC6: before assignment, the Organiser's Event Coordinator row says "Unassigned".
    await signIn(page, ORGANISER)
    await page.goto(`/requests/${unassigned.id}`)
    await expect(page.getByRole('heading', { name: unassigned.core.title })).toBeVisible()
    await expect(page.getByLabel('Event Coordinator')).toHaveText('Unassigned')
    await logout(page)

    // AC3: the Lead opens the queue from the navbar.
    await signIn(page, LEAD)
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Unassigned requests' }).click()
    await expect(page).toHaveURL(/\/requests\/unassigned$/)
    const card = page.locator('.booking-card').filter({ has: page.getByRole('heading', { name: unassigned.core.title }) })
    await expect(card).toContainText(ORGANISER.organisationName)
    await expect(card).toContainText('80')

    // AC4: pick a Coordinator (with active events shown, nothing pre-selected) and confirm.
    await card.getByRole('button', { name: 'Assign' }).click()
    const picker = card.getByRole('group', { name: `Assign a Coordinator to ${unassigned.core.title}` })
    const select = picker.getByLabel('Event Coordinator')
    await expect(select).toHaveValue('')
    await expect(select.locator('option')).toContainText([`${COORDINATOR.name} · 2 active events`])
    await expect(select.locator('option', { hasText: LEAD.name })).toHaveCount(0)
    await select.selectOption(COORDINATOR.uid)
    await picker.getByRole('button', { name: 'Confirm assignment' }).click()
    await expect(page.getByRole('status')).toHaveText(`“${unassigned.core.title}” was assigned to ${COORDINATOR.name}.`)
    await expect(page.getByRole('heading', { name: unassigned.core.title })).toHaveCount(0)
    await expect(page.getByText('No requests are waiting for a Coordinator.')).toBeVisible()
    await logout(page)

    // The Coordinator now has it under "Events assigned to you".
    await signIn(page, COORDINATOR)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'Events assigned to you', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: unassigned.core.title, exact: true })).toBeVisible()
    await logout(page)

    // And the Organiser sees the Coordinator's name instead of "Unassigned".
    await signIn(page, ORGANISER)
    await page.goto(`/requests/${unassigned.id}`)
    await expect(page.getByLabel('Event Coordinator')).toHaveText(COORDINATOR.name)
  })

  test('spm68_a_coordinator_cannot_open_the_queue', async ({ page }) => {
    await signIn(page, COORDINATOR)
    await page.goto('/requests/unassigned')
    await expect(page.getByRole('heading', { name: 'You do not have access to this page' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Unassigned requests' })).toHaveCount(0)
  })
})
