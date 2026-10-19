// SPM-58 end-to-end in Chromium: after Technical Support Staff reserve two projectors for "A1 planning"
// (SPM-37 units, SPM-17 request, SPM-56 approval, SPM-62 reservation), they open Equipment > View reservations
// and see the reservation's event, type, quantity and Active status; each reserved unit names the event; and
// the event's Equipment Required tab lists the reserved equipment. Firebase is the in-memory double.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const equipmentCard = (page) => page.locator('.equipment-requests')

async function openEquipmentTab(page) {
  await page.goto(`/requests/${planning.id}`)
  await page.getByRole('tab', { name: 'Equipment Required' }).click()
}

test.describe('SPM-58 — View which event each equipment reservation is for (E2E)', () => {
  test.use({ timezoneId: 'Asia/Singapore' })

  test('spm58_technical_staff_trace_a_reservation_to_its_event', async ({ page }) => {
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/equipment')
    await page.getByLabel('Equipment type').fill('Portable projector')
    await page.getByRole('button', { name: 'Add equipment type' }).click()
    await page.getByRole('link', { name: 'View units for Portable projector' }).click()
    const typeUrl = page.url()
    for (const tag of ['PRJ-001', 'PRJ-002', 'PRJ-003']) {
      await page.getByLabel('Asset tag').fill(tag)
      await page.getByRole('button', { name: 'Add unit' }).click()
      await expect(page.getByText(`Unit ${tag} added as Available.`)).toBeVisible()
    }
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await openEquipmentTab(page)
    await equipmentCard(page).getByLabel('Equipment type').selectOption({ label: 'Portable projector (3 available)' })
    await equipmentCard(page).getByLabel('Quantity').fill('2')
    await equipmentCard(page).getByRole('button', { name: 'Submit equipment request' }).click()
    await expect(equipmentCard(page).getByText(/Equipment request sent to .+ for review\./)).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.technicalStaff)
    await openEquipmentTab(page)
    await equipmentCard(page).getByRole('button', { name: 'Approve request' }).click()
    await expect(page.getByText('Approved. The technical arrangement is approved.')).toBeVisible()
    await equipmentCard(page).getByRole('button', { name: 'Reserve equipment' }).click()
    await expect(page.getByText('Reserved. The equipment is now held for this event.')).toBeVisible()
    // The event record lists the reserved equipment under its equipment section.
    const reservedCard = page.getByLabel('Reserved equipment')
    await expect(reservedCard.getByText('2 × Portable projector')).toBeVisible()

    // Equipment > View reservations: not in the navbar.
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /reservation/i })).toHaveCount(0)
    await page.goto('/equipment')
    await page.getByRole('link', { name: 'View reservations' }).click()
    const record = page.getByLabel(`Reservation for ${planning.core.title}`)
    await expect(record.getByText('Active')).toBeVisible()
    await expect(record.getByText('2 × Portable projector')).toBeVisible()
    await expect(record.getByText('PRJ-001, PRJ-002')).toBeVisible()
    // The event's date and start/end time (formatted in the browser's locale, so matched loosely).
    await expect(record.locator('.profile-row', { hasText: 'Event date and time' })).toContainText('2026')

    // Each reserved unit names the event; the third is not reserved.
    await page.goto(typeUrl)
    const unit = (tag) => page.getByRole('heading', { name: tag }).locator('xpath=ancestor::li[1]')
    await expect(unit('PRJ-001').getByRole('link', { name: planning.core.title })).toBeVisible()
    await expect(unit('PRJ-002').getByRole('link', { name: planning.core.title })).toBeVisible()
    await expect(unit('PRJ-003').getByText('Not reserved')).toBeVisible()
  })
})
