// SPM-18 end-to-end in Chromium: Technical Support Staff add a projector type with two units and mark one
// Damaged (SPM-37); the assigned Coordinator requests two projectors for "A1 planning" (SPM-17); the assigned
// Technical Support Staff member checks availability and sees a shortfall, repairs the unit, and the re-check
// shows the request can be fulfilled. The Coordinator gets no check. Firebase is the in-memory double; the
// API and app are real.
//
// A1 planning has both staff teams assigned, so SPM-17's reuse order assigns the request to Seed Technical
// Staff (Technical Support only, before the venue + technical account).

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { PLANNING } from '../../../shared/status.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

async function setStatus(page, assetTag, label) {
  const form = page.getByRole('form', { name: `Status of ${assetTag}` })
  await form.getByLabel('Status').selectOption({ label })
  await form.getByRole('button', { name: 'Save status' }).click()
  await expect(page.getByText(`${assetTag} is now ${label}.`)).toBeVisible()
}

function equipmentCard(page) {
  return page.locator('.equipment-requests')
}

test.describe('SPM-18 — Check equipment availability for an event (E2E)', () => {
  test('spm18_assigned_technical_staff_see_a_shortfall_then_can_fulfil_after_a_repair', async ({ page }) => {
    expect(planning?.status).toBe(PLANNING)
    expect(planning.assignedCoordinatorUid).toBe(ROLE_USERS.coordinator.uid)

    // SPM-37: two projectors, one Damaged.
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/equipment')
    await page.getByLabel('Equipment type').fill('Portable projector')
    await page.getByRole('button', { name: 'Add equipment type' }).click()
    await page.getByRole('link', { name: 'View units for Portable projector' }).click()
    const equipmentUrl = page.url()
    for (const tag of ['PRJ-001', 'PRJ-002']) {
      await page.getByLabel('Asset tag').fill(tag)
      await page.getByRole('button', { name: 'Add unit' }).click()
      await expect(page.getByText(`Unit ${tag} added as Available.`)).toBeVisible()
    }
    await setStatus(page, 'PRJ-001', 'Damaged')
    await logout(page)

    // SPM-17: the assigned Coordinator requests two projectors; they get no availability check.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    const coordinatorCard = equipmentCard(page)
    await coordinatorCard.getByLabel('Equipment type').selectOption({ label: 'Portable projector (1 available)' })
    await coordinatorCard.getByLabel('Quantity').fill('2')
    await coordinatorCard.getByRole('button', { name: 'Submit equipment request' }).click()
    await expect(coordinatorCard.getByText(/Equipment request sent to .+ for review\./)).toBeVisible()
    await expect(coordinatorCard.getByRole('button', { name: 'Check availability' })).toHaveCount(0)
    await logout(page)

    // SPM-18: the assigned Technical Support Staff member checks it.
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto(`/requests/${planning.id}`)
    const staffCard = equipmentCard(page)
    await staffCard.getByRole('button', { name: 'Check availability' }).click()
    await expect(staffCard.getByText('Shortfall: this request cannot be fulfilled.')).toBeVisible()
    await expect(staffCard.getByText(/1 available, 2 requested — short by 1/)).toBeVisible()

    // The damaged unit is repaired; the re-check now shows the request can be fulfilled.
    await page.goto(equipmentUrl)
    await setStatus(page, 'PRJ-001', 'Available')
    await page.goto(`/requests/${planning.id}`)
    await equipmentCard(page).getByRole('button', { name: 'Check availability' }).click()
    await expect(equipmentCard(page).getByText('Can be fulfilled: every equipment type has enough available units.')).toBeVisible()
    await expect(equipmentCard(page).getByText(/2 available, 2 requested — enough/)).toBeVisible()
  })
})
