// SPM-48 end-to-end in Chromium: Venue Staff update venue preparation on the seeded Confirmed event (both
// sign-offs approved) and its assigned Coordinator sees the update and its history entry; Technical Support
// Staff see a read-only Equipment preparation card on the seeded Planning event, which awaits technical
// sign-off; the owning Organiser sees no preparation. Firebase is the in-memory double; the API and app are real.

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

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

const historyRows = (page) => page.getByRole('list', { name: 'Change history entries' }).getByRole('listitem')

test.describe('SPM-48 — Venue and Technical Support Staff update preparation status (E2E)', () => {
  test('spm48_venue_staff_update_venue_preparation_and_the_coordinator_sees_it', async ({ page, request }) => {
    expect(confirmed.assignedCoordinatorUid).toBe(COORDINATOR.uid)
    expect((await request.post(`${DOUBLE_ORIGIN}/__double__/accounts/coordinator3`)).ok()).toBeTruthy()
    expect(confirmed.arrangementApprovals.venue.decision).toBe('approved')

    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    await expect(page.getByRole('heading', { name: 'Venue preparation' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Equipment preparation' })).toHaveCount(0)
    await expect(page.getByLabel('Venue preparation status')).toHaveValue('not_started')

    await page.getByLabel('Venue preparation status').selectOption('in_progress')
    await page.getByLabel('Venue preparation notes').fill('Chairs ordered for theatre layout')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toHaveText('Changes saved.')

    await logout(page)
    await signIn(page, COORDINATOR)
    await page.goto(`/requests/${confirmed.id}`)
    await page.getByRole('tab', { name: 'Venue Details' }).click()
    const card = page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Venue preparation' }) })
    await expect(card.getByText('Read only')).toBeVisible()
    await expect(card.getByText('In Progress')).toBeVisible()
    await expect(card.getByText('Chairs ordered for theatre layout')).toBeVisible()
    await expect(page.getByLabel('Venue preparation status')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Change Log' }).click()
    await expect(historyRows(page).filter({ hasText: 'Not Started → In Progress' })).toHaveCount(1)
    await expect(historyRows(page).filter({ hasText: `${ROLE_USERS.venueStaff.name}` }).first()).toBeVisible()
  })

  test('spm48_technical_staff_see_a_read_only_card_awaiting_technical_sign_off', async ({ page }) => {
    expect(planning.arrangementApprovals).toBeUndefined()

    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('tab', { name: 'Equipment Required' }).click()
    const card = page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Equipment preparation' }) })
    await expect(card.getByText('Read only')).toBeVisible()
    // SPM-62: equipment preparation now waits for the equipment reservation, not the technical sign-off.
    await expect(card.getByText('Available once the equipment is reserved.')).toBeVisible()
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
