// SPM-84 end-to-end in Chromium: the Event Coordinator Lead assigns the queued request to Seed Coordinator 2 from the
// Unassigned requests page; the Coordinator opens Notifications and follows the notice to the event; the owning
// Organiser's notice names the Coordinator. Firebase is the in-memory double; the API and app are real.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const LEAD = EXTRA_USERS.coordinatorLead
const COORDINATOR = EXTRA_USERS.secondCoordinator
const ORGANISER = SEED_ACCOUNTS.organiserA2
const unassigned = SEED_REQUESTS.find((request) => request.id === 'seed-req-a2-unassigned')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-84 — the Coordinator and Organiser are told about an assignment (E2E)', () => {
  test('spm84_coordinator_follows_the_notice_to_the_event_and_the_organiser_is_told_who', async ({ page, request }) => {
    expect(unassigned?.assignedCoordinatorUid).toBeNull()
    // organiser-a2 is not one of the default E2E accounts; the double signs it in for this test.
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/organiserA2`)).ok()).toBeTruthy()

    await signIn(page, LEAD)
    await page.goto('/requests/unassigned')
    const card = page.locator('.booking-card').filter({ has: page.getByRole('heading', { name: unassigned.core.title }) })
    await card.getByRole('button', { name: 'Assign' }).click()
    const picker = card.getByRole('group', { name: `Assign a Coordinator to ${unassigned.core.title}` })
    await picker.getByLabel('Event Coordinator').selectOption(COORDINATOR.uid)
    await picker.getByRole('button', { name: 'Confirm assignment' }).click()
    await expect(page.getByRole('status')).toHaveText(`“${unassigned.core.title}” was assigned to ${COORDINATOR.name}.`)
    // AC4: the acting Lead is not notified.
    await page.getByRole('link', { name: 'Notifications' }).click()
    await expect(page.getByRole('heading', { name: 'No notifications' })).toBeVisible()
    await logout(page)

    // AC1/AC3: the Coordinator's notice opens the event.
    await signIn(page, COORDINATOR)
    await page.getByRole('link', { name: 'Notifications' }).click()
    const notice = page.getByRole('listitem').filter({ hasText: `“${unassigned.core.title}” has been assigned to you.` })
    await expect(notice).toContainText('Event starts:')
    await notice.getByRole('link', { name: 'View event' }).click()
    await expect(page).toHaveURL(new RegExp(`/requests/${unassigned.id}$`))
    await expect(page.getByRole('heading', { name: unassigned.core.title })).toBeVisible()
    await logout(page)

    // AC1: the owning Organiser's notice names the Coordinator and opens the event.
    await signIn(page, ORGANISER)
    await page.getByRole('link', { name: 'Notifications' }).click()
    const organiserNotice = page.getByRole('listitem').filter({ hasText: unassigned.core.title })
    await expect(organiserNotice.getByRole('heading')).toHaveText(`${COORDINATOR.name} is now the Event Coordinator for “${unassigned.core.title}”.`)
    await organiserNotice.getByRole('link', { name: 'View event' }).click()
    await expect(page.getByLabel('Event Coordinator')).toHaveText(COORDINATOR.name)
  })
})
