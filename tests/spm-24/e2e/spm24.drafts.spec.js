// SPM-24 end-to-end in Chromium: the saved drafts page, its empty state, the distinction from
// submitted requests, and opening a draft for editing.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DRAFT } from '../../../shared/status.js'
import { EXTRA_USERS, ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

// loginAs submits the form; the app lands on /profile. Wait for that before navigating, or the next
// goto races the redirect and arrives unauthenticated.
async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const ownDrafts = SEED_REQUESTS.filter((request) => request.status === DRAFT && request.ownerUid === ROLE_USERS.organiser.uid)

test.describe('SPM-24 — View my saved draft requests and distinguish them from submitted requests (E2E)', () => {
  test('spm24_drafts_page_lists_every_draft_i_own_and_no_one_elses', async ({ page }) => {
    expect(ownDrafts.length).toBeGreaterThan(1)
    await signIn(page, ROLE_USERS.organiser)
    await page.getByRole('link', { name: 'My drafts' }).click()

    await expect(page).toHaveURL(/\/requests\/drafts$/)
    await expect(page.getByRole('heading', { name: 'Saved drafts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue editing' })).toHaveCount(ownDrafts.length)
    // A draft with no title is still listed, because a draft may be incomplete.
    await expect(page.getByRole('heading', { name: 'Untitled draft' })).toBeVisible()
    // A colleague's draft never appears.
    await expect(page.getByText('A2 draft', { exact: false })).toHaveCount(0)
  })

  test('spm24_selecting_a_draft_opens_it_for_editing', async ({ page }) => {
    // A draft with saved values to check, so an editor that failed to load (an empty form) cannot pass.
    const draft = ownDrafts.find((request) => request.core.title && request.core.expectedAttendees)
    await signIn(page, ROLE_USERS.organiser)
    await page.goto('/requests/drafts')
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: draft.core.title, exact: true }) })
      .getByRole('link', { name: 'Continue editing' })
      .click()

    await expect(page).toHaveURL(new RegExp(`/event-requests/${draft.id}/edit$`))
    await expect(page.getByLabel('Event title')).toHaveValue(draft.core.title)
    await expect(page.getByLabel('Expected attendance')).toHaveValue(String(draft.core.expectedAttendees))
    await expect(page.getByLabel('Event title')).toBeEditable()
  })

  test('spm24_an_organiser_with_no_drafts_is_told_so', async ({ page }) => {
    const organiserWithNothing = EXTRA_USERS.organiserWithoutRequests
    expect(SEED_REQUESTS.some((request) => request.ownerUid === organiserWithNothing.uid)).toBe(false)

    await signIn(page, organiserWithNothing)
    await page.goto('/requests/drafts')

    await expect(page.getByRole('heading', { name: 'You have no saved drafts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create an event request' })).toBeVisible()
  })

  test('spm24_submitted_requests_are_shown_with_their_status_and_not_as_drafts', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto('/requests')

    // exact, so the status pill is matched rather than the seeded request title that contains the words
    await expect(page.getByText('Returned for clarification', { exact: true })).toBeVisible()
    await expect(page.getByText('Under review', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue editing' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'A1 draft (private to A1)' })).toHaveCount(0)
  })

  test('spm24_a_draft_is_invisible_to_the_coordinator', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/requests')

    await expect(page.getByRole('heading', { name: 'All event requests' })).toBeVisible()
    await expect(page.getByText('A1 draft (private to A1)')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'My drafts' })).toHaveCount(0)
  })
})
