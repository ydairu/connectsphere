// SPM-42 end-to-end in Chromium: the real frontend and the real Express API, with Firebase replaced by
// the in-memory double. What a role may see and edit is decided by the API; these tests check that the
// product presents exactly that, which is the demonstration the story is assessed on.

import { ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { EXTRA_USERS, ROLE_USERS, expect, expectForbiddenPage, loginAs, test } from '../../shared/e2e/fixtures.js'

// loginAs submits the form; the app lands on /profile. Wait for that before navigating, or the next
// goto races the redirect and arrives unauthenticated.
async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const A1_PLANNING = 'seed-req-a1-planning'
const A1_SUBMITTED = 'seed-req-a1-submitted'
const A1_DRAFT = 'seed-req-a1-draft'
const A2_DRAFT = 'seed-req-a2-draft'

// One account, two staff roles — SPM-42's combined-permissions criterion.
const DUAL_ROLE_STAFF = EXTRA_USERS.venueTechnicalStaff

test.describe('SPM-42 — View and edit information according to my role’s permissions (E2E)', () => {
  test('spm42_venue_staff_edit_venue_and_never_see_equipment', async ({ page }) => {
    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${A1_PLANNING}`)

    await expect(page.getByRole('heading', { name: 'Venue' })).toBeVisible()
    await expect(page.getByLabel('Layout preference')).toBeEditable()
    // Absent from the page, because it is absent from the response — not hidden by the interface.
    await expect(page.getByRole('heading', { name: 'Equipment and technical support' })).toHaveCount(0)
    await expect(page.getByText('projector')).toHaveCount(0)
    // Main details are viewable but not theirs to change.
    await expect(page.getByRole('heading', { name: 'Event details' })).toBeVisible()
    await expect(page.getByLabel('Title')).toHaveCount(0)
  })

  test('spm42_technical_staff_edit_equipment_and_never_see_venue', async ({ page }) => {
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto(`/requests/${A1_PLANNING}`)

    await expect(page.getByRole('heading', { name: 'Equipment and technical support' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Venue' })).toHaveCount(0)
    await expect(page.getByLabel('Layout preference')).toHaveCount(0)
  })

  test('spm42_dual_role_account_edits_venue_and_equipment_on_one_event', async ({ page }) => {
    expect(DUAL_ROLE_STAFF.roles).toEqual([VENUE_STAFF, TECHNICAL_STAFF])
    await signIn(page, DUAL_ROLE_STAFF)
    await page.goto(`/requests/${A1_PLANNING}`)

    await page.getByLabel('Layout preference').fill('banquet')
    await page.getByLabel('Equipment required (one per line)').fill('projector\nlectern')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByRole('alert')).toHaveText('Changes saved.')
    await page.reload()
    await expect(page.getByLabel('Layout preference')).toHaveValue('banquet')
    await expect(page.getByLabel('Equipment required (one per line)')).toHaveValue('projector\nlectern')
  })

  test('spm42_coordinator_edits_every_section_including_internal_notes', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${A1_SUBMITTED}`)

    for (const section of ['Event details', 'Venue', 'Equipment and technical support', 'Registration', 'Internal planning']) {
      await expect(page.getByRole('heading', { name: section })).toBeVisible()
    }
    await page.getByLabel('Planning notes').fill('Coordinator note from E2E')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toHaveText('Changes saved.')
  })

  test('spm42_organiser_cannot_edit_their_own_request_once_submitted', async ({ page }) => {
    expect(ROLE_USERS.organiser.roles).toEqual([ORGANISER])
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${A1_SUBMITTED}`)

    await expect(page.getByText('You can view this request but cannot change it.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(page.getByLabel('Title')).toHaveCount(0)
  })

  test('spm42_attendee_sees_no_internal_planning_information', async ({ page }) => {
    await signIn(page, ROLE_USERS.attendee)
    await page.goto('/requests/seed-req-a1-confirmed')

    await expect(page.getByRole('heading', { name: 'Event details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Internal planning' })).toHaveCount(0)
    await expect(page.getByText('Seed internal note', { exact: false })).toHaveCount(0)
  })

  test('spm42_direct_link_to_another_organisation_or_a_draft_is_denied', async ({ page }) => {
    await signIn(page, ROLE_USERS.attendee)
    await page.goto(`/requests/${A1_DRAFT}`)
    await expect(page.getByRole('alert')).toHaveText('You do not have access to this request.')

    await page.goto('/requests/seed-req-b1-planning')
    await expect(page.getByRole('alert')).toHaveText('You do not have access to this request.')
  })

  test('spm42_organiser_cannot_open_a_colleagues_draft', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${A2_DRAFT}`)
    await expect(page.getByRole('alert')).toHaveText('You do not have access to this request.')
  })

  test('spm42_signed_in_user_without_the_role_gets_403_not_the_login_page', async ({ page }) => {
    await signIn(page, ROLE_USERS.attendee)
    await page.goto('/requests/drafts')
    await expectForbiddenPage(page, '/requests/drafts')
  })
})
