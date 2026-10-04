// SPM-64 end-to-end in Chromium: the Organiser opens their own event after submission and sees its status
// and arrangements as requested, with the sign-off state, and cannot edit it or see internal planning.
// Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const byId = (id) => SEED_REQUESTS.find((request) => request.id === id)
const planning = byId('seed-req-a1-planning')
const underReview = byId('seed-req-a1-under-review')
const colleagues = byId('seed-req-a2-submitted')
const NOT_STARTED = 'Not started — reviewed during planning'

const summaryRow = (page, label) => page.getByLabel(label, { exact: true })
const statusPill = (page) => page.locator('.page-heading .status-pill')
const signOff = (page, label) => page.locator('.profile-row', { hasText: label }).locator('strong')

test.describe('SPM-64 — View and edit my event request (E2E)', () => {
  test('spm64_organiser_sees_status_and_requested_arrangements_read_only', async ({ page }) => {
    expect(planning.ownerUid).toBe(ROLE_USERS.organiser.uid)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Planning')

    await expect(page.getByRole('heading', { name: 'Your event arrangements' })).toBeVisible()
    await expect(summaryRow(page, 'Date and time')).toContainText(`Requested:`)
    await expect(summaryRow(page, 'Date and time')).toContainText(`${planning.core.durationHours} hours`)
    await expect(summaryRow(page, 'Venue')).toContainText(`Requested: ${planning.venue.layoutPreference} layout`)
    await expect(summaryRow(page, 'Venue')).toContainText('Sign-off: Awaiting approval')
    await expect(summaryRow(page, 'Equipment')).toContainText(`Requested: ${planning.equipment.requirements.join(', ')}`)

    // Read-only, and no internal planning.
    await expect(page.getByText('You can view this request but cannot change it.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(page.getByLabel('Title')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Internal planning' })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(planning.internal.planningNotes)
  })

  test('spm64_before_planning_both_cards_say_sign_off_has_not_started', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${underReview.id}`)
    await expect(statusPill(page)).toHaveText('Under review')
    await expect(summaryRow(page, 'Venue')).toContainText(`Sign-off: ${NOT_STARTED}`)
    await expect(signOff(page, 'Venue arrangement')).toHaveText(NOT_STARTED)
    await expect(page.getByText('Awaiting approval')).toHaveCount(0)
  })

  test('spm64_colleagues_event_is_read_only', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${colleagues.id}`)
    await expect(page.getByRole('heading', { name: colleagues.core.title })).toBeVisible()
    await expect(page.getByText('You can view this request but cannot change it.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })
})
