// SPM-28 end-to-end in Chromium: the Organiser edits a returned request and sees the change in its history;
// on the seeded planning event the assigned Coordinator sees every recorded change, including internal
// planning, and the Organiser sees the same changes without it. Firebase is the in-memory double (seeded
// with SEED_FIELD_HISTORY); the API and app are real.

import { SEED_FIELD_HISTORY, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const byId = (id) => SEED_REQUESTS.find((request) => request.id === id)
const returned = byId('seed-req-a1-returned')
const planning = byId('seed-req-a1-planning')

const historyRows = (page) => page.getByRole('list', { name: 'Change history entries' }).getByRole('listitem')

test.describe('SPM-28 — View the change history of an event (E2E)', () => {
  test('spm28_organiser_edits_a_returned_request_and_sees_the_change_recorded', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${returned.id}`)
    await page.getByRole('tab', { name: 'Change Log' }).click()
    await expect(page.getByRole('heading', { name: 'Change history' })).toBeVisible()
    await expect(page.getByText('No changes recorded yet.')).toBeVisible()

    await page.getByRole('tab', { name: 'Event Status' }).click()
    await page.getByLabel('Purpose').fill('Purpose amended after clarification')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()

    await page.getByRole('tab', { name: 'Change Log' }).click()
    await expect(historyRows(page)).toHaveCount(1)
    const row = historyRows(page).first()
    await expect(row).toHaveAccessibleName('Event details · Purpose')
    await expect(row).toContainText(`${returned.core.purpose} → Purpose amended after clarification`)
    await expect(row).toContainText(`${ROLE_USERS.organiser.name} (Event Organiser)`)
  })

  test('spm28_coordinator_sees_internal_changes_that_the_organiser_does_not', async ({ page }) => {
    expect(SEED_FIELD_HISTORY[planning.id]).toHaveLength(3)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('tab', { name: 'Change Log' }).click()
    await expect(historyRows(page)).toHaveCount(3)
    await expect(historyRows(page).nth(0)).toHaveAccessibleName('Internal planning · Planning notes')
    await expect(historyRows(page).nth(1)).toHaveAccessibleName('Venue · Layout preference')
    await expect(historyRows(page).nth(1)).toContainText('banquet → theatre')
    await expect(historyRows(page).nth(2)).toHaveAccessibleName('Event details · Expected attendees')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('tab', { name: 'Change Log' }).click()
    await expect(historyRows(page)).toHaveCount(2)
    await expect(page.getByRole('listitem', { name: 'Internal planning · Planning notes' })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(planning.internal.planningNotes)
  })

  test('spm28_venue_staff_see_no_change_history', async ({ page }) => {
    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByRole('heading', { name: planning.core.title })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change history' })).toHaveCount(0)
  })
})
