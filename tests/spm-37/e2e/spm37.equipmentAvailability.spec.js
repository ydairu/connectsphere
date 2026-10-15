// SPM-37 end-to-end in Chromium: Technical Support Staff add equipment and units, mark units Damaged, Under
// Repair and Unavailable, and see them excluded from the available count; a repaired unit counts again; a
// Coordinator sees the same count read-only; an Organiser cannot open the page. Firebase is the in-memory
// double; the API and app are real.

import { FORBIDDEN_HEADING, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

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

test.describe('SPM-37 — Exclude unavailable equipment from the available quantity (E2E)', () => {
  test('spm37_unusable_units_are_excluded_and_a_repaired_unit_counts_again', async ({ page }) => {
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.getByRole('link', { name: 'Equipment', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Equipment availability' })).toBeVisible()

    await page.getByLabel('Equipment type').fill('Wireless microphone')
    await page.getByRole('button', { name: 'Add equipment type' }).click()
    await page.getByRole('link', { name: 'View units for Wireless microphone' }).click()

    for (const tag of ['MIC-001', 'MIC-002', 'MIC-003', 'MIC-004']) {
      await page.getByLabel('Asset tag').fill(tag)
      await page.getByRole('button', { name: 'Add unit' }).click()
      await expect(page.getByText(`Unit ${tag} added as Available.`)).toBeVisible()
    }
    await expect(page.getByText('4 of 4 units available.')).toBeVisible()

    await setStatus(page, 'MIC-001', 'Damaged')
    await setStatus(page, 'MIC-002', 'Under Repair')
    await setStatus(page, 'MIC-003', 'Unavailable')
    await expect(page.getByText('1 of 4 units available.')).toBeVisible()

    // AC4: the damaged unit is repaired and marked Available again.
    await setStatus(page, 'MIC-001', 'Available')
    await expect(page.getByText('2 of 4 units available.')).toBeVisible()

    // AC2/AC3: the counts hold for a checked event period.
    await page.getByRole('link', { name: 'Equipment availability' }).click()
    await page.getByLabel('From', { exact: true }).fill('2026-11-20T09:00')
    await page.getByLabel('To', { exact: true }).fill('2026-11-20T17:00')
    await page.getByRole('button', { name: 'Check availability' }).click()
    await expect(page.getByText(/Showing availability from/)).toBeVisible()
    const card = page.getByRole('listitem').filter({ hasText: 'Wireless microphone' })
    await expect(card.getByText('2 of 4')).toBeVisible()
    await expect(card.getByText('0 damaged, 1 under repair, 1 unavailable')).toBeVisible()

    await logout(page)
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/equipment')
    await expect(page.getByRole('listitem').filter({ hasText: 'Wireless microphone' }).getByText('2 of 4')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add an equipment type' })).toHaveCount(0)
    await page.getByRole('link', { name: 'View units for Wireless microphone' }).click()
    await expect(page.getByText('2 of 4 units available.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save status' })).toHaveCount(0)
  })

  test('spm37_organisers_cannot_open_equipment', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await expect(page.getByRole('link', { name: 'Equipment', exact: true })).toHaveCount(0)
    await page.goto('/equipment')
    await expect(page.getByRole('heading', { name: FORBIDDEN_HEADING })).toBeVisible()
  })
})
