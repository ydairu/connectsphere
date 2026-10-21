// SPM-27 end-to-end in Chromium: the assigned Coordinator marks a Confirmed event that has taken place as
// Completed; it is labelled Completed under Closed events, and the request page records who completed it and
// when. Firebase is the in-memory double; the API and app are real.
//
// Set-up through the real API: the Coordinator moves the seeded Planning event's date into the past (an edit
// their role may make at Planning), staff approve it, then the Coordinator confirms it. The order matters: a
// date change at Planning is a significant change (SPM-10) and clears the sign-offs, so the date moves first.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test, approveVenueForEvent } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const statusPill = (page) => page.locator('.page-heading .status-pill')
const rowValue = (page, label) => page.locator('.profile-row', { hasText: label }).locator('strong')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const headers = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

async function actAs(request, account, action) {
  const response = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${planning.id}/transitions`, { headers: headers(account), data: { action } })
  expect(response.ok(), `${account.uid} ${action}`).toBeTruthy()
}

test.describe('SPM-27 — Coordinator marks an event Completed (E2E)', () => {
  test('spm27_coordinator_marks_a_past_confirmed_event_completed_and_it_moves_to_closed_events', async ({ page }) => {
    const pastStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const moved = await page.request.patch(`${DOUBLE_ORIGIN}/api/requests/${planning.id}`, {
      headers: headers(ROLE_USERS.coordinator),
      data: { core: { preferredDateTime: pastStart } },
    })
    expect(moved.ok(), 'move the event date into the past').toBeTruthy()
    await approveVenueForEvent(page.request, planning.id)
    await actAs(page.request, ROLE_USERS.technicalStaff, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, 'confirm')

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Confirmed')
    await page.getByRole('button', { name: 'Mark as completed' }).click()
    await expect(page.getByText(/A completed event cannot change status again/)).toBeVisible()
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Mark as completed' }).click()
    await expect(statusPill(page)).toHaveText('Completed')
    await expect(page.getByRole('heading', { name: 'Event completed' })).toBeVisible()
    await expect(rowValue(page, 'Marked completed by')).toHaveText(ROLE_USERS.coordinator.name)
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)

    await page.goto('/requests')
    const closed = page.getByRole('region', { name: 'Closed events' })
    await expect(closed.locator('li', { hasText: planning.core.title }).locator('.status-pill')).toHaveText('Completed')
    await expect(page.locator('ul.request-list').first().getByText(planning.core.title)).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Completed')
    await expect(rowValue(page, 'Marked completed on')).not.toHaveText('')
    await expect(page.getByText('Marked completed by')).toHaveCount(0)
  })

  test('spm27_mark_as_completed_is_not_offered_before_the_event_has_taken_place', async ({ page }) => {
    // The seeded event starts 20 Nov 2026; this relies on the real clock being before it ends.
    await approveVenueForEvent(page.request, planning.id)
    await actAs(page.request, ROLE_USERS.technicalStaff, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, 'confirm')

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Confirmed')
    await expect(page.getByRole('button', { name: 'Cancel event' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as completed' })).toHaveCount(0)
  })
})
