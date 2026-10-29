// SPM-69 end-to-end in Chromium: the Coordinator of "A1 planning" has an equipment request on it (SPM-37 unit,
// SPM-17 request); the Event Coordinator Lead finds the event in their Requests list, sees its Coordinator and
// reassigns it to Seed Coordinator 2; the new Coordinator finds it under "Events assigned to you" with its equipment
// request; the former Coordinator can no longer open it and was never offered Reassign. Firebase is the in-memory
// double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { PLANNING } from '../../../shared/status.js'
import { EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const FROM = ROLE_USERS.coordinator
const TO = EXTRA_USERS.secondCoordinator
const LEAD = EXTRA_USERS.coordinatorLead

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const equipmentCard = (page) => page.locator('.equipment-requests')

async function openEquipmentTab(page) {
  await page.goto(`/requests/${planning.id}`)
  await page.getByRole('tab', { name: 'Equipment Required' }).click()
}

test.describe('SPM-69 — the Event Coordinator Lead reassigns an event between Coordinators (E2E)', () => {
  test('spm69_lead_reassigns_a_planning_event_and_the_new_coordinator_gets_its_equipment_request', async ({ page }) => {
    expect(planning?.status).toBe(PLANNING)
    expect(planning.assignedCoordinatorUid).toBe(FROM.uid)

    // Set-up as SPM-58's spec does: one projector unit, then the Coordinator's equipment request.
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/equipment')
    await page.getByLabel('Equipment type').fill('Portable projector')
    await page.getByRole('button', { name: 'Add equipment type' }).click()
    await page.getByRole('link', { name: 'View units for Portable projector' }).click()
    await page.getByLabel('Asset tag').fill('PRJ-001')
    await page.getByRole('button', { name: 'Add unit' }).click()
    await expect(page.getByText('Unit PRJ-001 added as Available.')).toBeVisible()
    await logout(page)

    await signIn(page, FROM)
    await openEquipmentTab(page)
    await equipmentCard(page).getByLabel('Equipment type').selectOption({ label: 'Portable projector (1 available)' })
    await equipmentCard(page).getByLabel('Quantity').fill('1')
    await equipmentCard(page).getByRole('button', { name: 'Submit equipment request' }).click()
    await expect(equipmentCard(page).getByText(/Equipment request sent to .+ for review\./)).toBeVisible()
    // AC3: the assigned Coordinator is not offered Reassign.
    await page.getByRole('tab', { name: 'Event Status' }).click()
    await expect(page.getByRole('button', { name: 'Reassign coordinator' })).toHaveCount(0)
    await logout(page)

    // AC1: the Lead finds the event in their list, sees its Coordinator, and reassigns it.
    await signIn(page, LEAD)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { level: 1, name: 'Requests you oversee' })).toBeVisible()
    await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: planning.core.title, exact: true }) }).getByRole('link', { name: 'View' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${planning.id}$`))
    await expect(page.getByLabel('Event Coordinator')).toHaveText(FROM.name)
    // AC5: no status actions for the Lead.
    for (const action of ['Approve', 'Reject', 'Return for clarification', 'Confirm']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Reassign coordinator' }).click()
    const form = page.getByRole('group', { name: 'Reassign coordinator' })
    await form.getByLabel('New Event Coordinator').selectOption(TO.uid)
    await form.getByRole('button', { name: 'Reassign event' }).click()
    await expect(page.getByText(`Event reassigned to ${TO.name}.`)).toBeVisible()
    await expect(page.getByLabel('Event Coordinator')).toHaveText(TO.name)
    await logout(page)

    // AC4: the new Coordinator has the event and its equipment request.
    await signIn(page, TO)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'Events assigned to you', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: planning.core.title, exact: true })).toBeVisible()
    await openEquipmentTab(page)
    await expect(equipmentCard(page)).toContainText('Portable projector')
    await logout(page)

    // The former Coordinator's direct link now shows not found.
    await signIn(page, FROM)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByText('This request no longer exists.')).toBeVisible()
  })
})
