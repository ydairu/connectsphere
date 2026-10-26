// SPM-61 end-to-end in Chromium: the assigned Coordinator returns a request with a message, and the Organiser
// finds the notice on the Notifications page and follows it to edit the request; a confirmed event's notice
// leads to its arrangements. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, approveVenueForEvent, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const underReview = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-under-review')
const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const MESSAGE = 'Please confirm the expected attendance.'
const statusPill = (page) => page.locator('.page-heading .status-pill')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

async function actAs(request, account, id, action) {
  const response = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${id}/transitions`, {
    headers: { Authorization: `Bearer test-token:${account.uid}` },
    data: { action },
  })
  expect(response.ok(), `${account.uid} ${action}`).toBeTruthy()
}

test.describe('SPM-61 — the Organiser is notified of status changes (E2E)', () => {
  test('spm61_coordinator_returns_a_request_and_the_organiser_follows_the_notice_to_edit_it', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${underReview.id}`)
    await page.getByRole('button', { name: 'Return for clarification' }).click()
    await page.getByLabel('Message to the organiser (required)').fill(MESSAGE)
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Return for clarification' }).click()
    await expect(statusPill(page)).toHaveText('Returned for clarification')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.getByRole('link', { name: 'Notifications' }).click()
    const notice = page.getByRole('listitem').filter({ hasText: `returned “${underReview.core.title}” for clarification` })
    await expect(notice).toBeVisible()
    await expect(notice.getByText(`Message from the coordinator: ${MESSAGE}`)).toBeVisible()
    await notice.getByRole('link', { name: 'Edit request' }).click()

    await expect(page).toHaveURL(new RegExp(`/requests/${underReview.id}$`))
    await expect(statusPill(page)).toHaveText('Returned for clarification')
    await expect(page.getByText('Read only')).toHaveCount(0)
  })

  test('spm61_a_confirmed_event_notice_leads_the_organiser_to_its_arrangements', async ({ page }) => {
    await approveVenueForEvent(page.request, planning.id)
    await actAs(page.request, ROLE_USERS.technicalStaff, planning.id, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, planning.id, 'confirm')

    await signIn(page, ROLE_USERS.organiser)
    await page.goto('/notifications')
    const notice = page.getByRole('listitem').filter({ hasText: `“${planning.core.title}” is confirmed.` })
    await expect(notice).toBeVisible()
    await notice.getByRole('link', { name: 'View arrangements' }).click()

    await expect(statusPill(page)).toHaveText('Confirmed')
    await expect(page.getByRole('heading', { name: 'Your event arrangements' })).toBeVisible()
  })
})
