// SPM-48/SPM-88 end-to-end in Chromium: staff update preparation after the Coordinator starts the
// Preparation stage. Safety approval is supplied by the test double until SPM-91/92 is implemented.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const byId = (id) => SEED_REQUESTS.find((request) => request.id === id)
const confirmed = byId('seed-req-a1-confirmed')
const planning = byId('seed-req-a1-planning')
// A1's confirmed event belongs to Seed Coordinator 3, who is not one of the double's standing test users;
// the test registers the account until the next reset.
const COORDINATOR = SEED_ACCOUNTS.coordinator3

test.describe('SPM-48 — equipment preparation and SPM-89 venue boundary (E2E)', () => {
  test('spm48_venue_staff_use_booking_preparation_instead_of_the_event_form', async ({ page, request }) => {
    expect(confirmed.assignedCoordinatorUid).toBe(COORDINATOR.uid)
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/coordinator3`)).ok()).toBeTruthy()
    expect(confirmed.arrangementApprovals.venue.decision).toBe('approved')
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/safety-approvals/${confirmed.id}`)).ok()).toBeTruthy()
    const started = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${confirmed.id}/transitions`, {
      headers: { Authorization: `Bearer test-token:${COORDINATOR.uid}` }, data: { action: 'start_preparation' },
    })
    expect(started.status(), await started.text()).toBe(200)

    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    await expect(page.getByRole('heading', { name: 'Venue preparation' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Equipment preparation' })).toHaveCount(0)
    const refused = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${confirmed.id}`, {
      headers: { Authorization: `Bearer test-token:${ROLE_USERS.venueStaff.uid}` }, data: { venuePreparation: { status: 'ready' } },
    })
    expect(refused.status()).toBe(403)
  })

  test('spm48_technical_staff_see_a_read_only_card_before_preparation', async ({ page }) => {
    expect(planning.arrangementApprovals).toBeUndefined()

    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('tab', { name: 'Equipment Required' }).click()
    const card = page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Equipment preparation' }) })
    await expect(card.getByText('Read only')).toBeVisible()
    await expect(card.getByText('Available once the event is in Preparation.')).toBeVisible()
    await expect(card.getByText('Not Started')).toBeVisible()
    await expect(page.getByLabel('Equipment preparation status')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Venue preparation' })).toHaveCount(0)
  })

  test('spm48_the_organiser_sees_no_preparation', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    await expect(page.getByRole('heading', { name: 'Venue', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Venue preparation' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Equipment preparation' })).toHaveCount(0)
  })
})
