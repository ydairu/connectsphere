// SPM-65 end-to-end in Chromium: the real frontend and the real Express API, with Firebase replaced by
// the in-memory double and the seeded requests. The seeded coordinator is assigned A1's active requests;
// A2's submitted request belongs to coordinator-2.

import { ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const A1_SUBMITTED = 'seed-req-a1-submitted'
const A2_SUBMITTED = 'seed-req-a2-submitted'

test.describe('SPM-65 — View my assigned events (E2E)', () => {
  test('spm65_coordinator_list_shows_only_events_assigned_to_them', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/requests')

    await expect(page.getByRole('heading', { name: 'Events assigned to you', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'A1 submitted', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /A2 submitted/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'A1 confirmed (registration open)' })).toHaveCount(0)
  })

  test('spm65_coordinator_cannot_open_another_coordinators_event_by_direct_link', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)

    await page.goto(`/requests/${A1_SUBMITTED}`)
    await expect(page.getByRole('heading', { name: 'Internal planning' })).toBeVisible()

    await page.goto(`/requests/${A2_SUBMITTED}`)
    await expect(page.getByText('This request no longer exists.')).toBeVisible()
    await expect(page.getByText('A2 submitted (A1 can view, cannot edit)')).toHaveCount(0)
  })
})
