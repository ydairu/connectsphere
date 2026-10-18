// SPM-62 end-to-end in Chromium: Technical Support Staff add two projectors (SPM-37); the assigned
// Coordinator requests both for "A1 planning" (SPM-17); the assigned Technical Support Staff member approves
// (SPM-56) and reserves them; the owning Organiser sees "Reserved: 2 × Portable projector" with no asset tags;
// the equipment page shows both units reserved for the event's period (SPM-57). Firebase is the in-memory
// double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const equipmentCard = (page) => page.locator('.equipment-requests')

// The Equipment requests card is on the request page's Equipment Required tab.
async function openEquipmentTab(page) {
  await page.goto(`/requests/${planning.id}`)
  await page.getByRole('tab', { name: 'Equipment Required' }).click()
}

test.describe('SPM-62 — Reserve available equipment for an event (E2E)', () => {
  // The period is typed in the browser's local time, and A1 planning is at 09:00 Singapore time. Pinning the
  // browser to Singapore keeps the overlap check the same on a UTC CI runner as on a machine in Singapore.
  test.use({ timezoneId: 'Asia/Singapore' })

  test('spm62_assigned_technical_staff_reserve_and_the_organiser_sees_reserved_equipment', async ({ page }) => {
    expect(planning.ownerUid).toBe(ROLE_USERS.organiser.uid)

    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/equipment')
    await page.getByLabel('Equipment type').fill('Portable projector')
    await page.getByRole('button', { name: 'Add equipment type' }).click()
    await page.getByRole('link', { name: 'View units for Portable projector' }).click()
    for (const tag of ['PRJ-001', 'PRJ-002']) {
      await page.getByLabel('Asset tag').fill(tag)
      await page.getByRole('button', { name: 'Add unit' }).click()
      await expect(page.getByText(`Unit ${tag} added as Available.`)).toBeVisible()
    }
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await openEquipmentTab(page)
    await equipmentCard(page).getByLabel('Equipment type').selectOption({ label: 'Portable projector (2 available)' })
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
    await expect(equipmentCard(page).getByText('Portable projector: PRJ-001, PRJ-002')).toBeVisible()

    // SPM-57: for the event's own period, both units are reserved and none is available to other events.
    await page.goto('/equipment')
    await page.getByLabel('From', { exact: true }).fill('2026-11-20T09:00')
    await page.getByLabel('To', { exact: true }).fill('2026-11-20T13:00')
    await page.getByRole('button', { name: 'Check availability' }).click()
    const projectorCard = page.getByRole('listitem').filter({ hasText: 'Portable projector' })
    await expect(projectorCard.getByText('0 of 2')).toBeVisible()
    await expect(projectorCard.getByText(/2 reserved for overlapping events/)).toBeVisible()
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    const equipmentRow = page.getByLabel('Equipment', { exact: true })
    await expect(equipmentRow).toContainText('Reserved: 2 × Portable projector')
    await expect(page.locator('body')).not.toContainText('PRJ-001')
  })
})
