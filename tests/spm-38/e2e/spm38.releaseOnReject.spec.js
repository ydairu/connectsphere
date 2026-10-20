// SPM-38 end-to-end in Chromium: Technical Support Staff reserve both projectors for "A1 planning" (SPM-37,
// SPM-17, SPM-56, SPM-62); the assigned Coordinator rejects the event (SPM-45); the reservation is listed as
// Released, with the time and "Event rejected", and both projectors are available again for that period.
// Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')
const statusPill = (page) => page.locator('.page-heading .status-pill')
const equipmentCard = (page) => page.locator('.equipment-requests')

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

async function openEquipmentTab(page) {
  await page.goto(`/requests/${planning.id}`)
  await page.getByRole('tab', { name: 'Equipment Required' }).click()
}

test.describe('SPM-38 — Release reserved equipment when an event is rejected (E2E)', () => {
  // The checked period is typed in browser-local time; A1 planning is at 09:00 Singapore time.
  test.use({ timezoneId: 'Asia/Singapore' })

  test('spm38_rejecting_the_event_releases_its_reserved_projectors', async ({ page }) => {
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
    await logout(page)

    // The assigned Coordinator rejects the event (SPM-45), on the Event Status tab.
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Planning')
    await page.getByRole('button', { name: 'Reject request' }).click()
    const dialog = page.getByRole('group', { name: 'Confirm status change' })
    await expect(dialog).toBeVisible()
    await page.getByLabel('Rejection reason (required)').fill('No venue can hold the attendance on that date')
    await expect(dialog.getByRole('button', { name: 'Reject request' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Reject request' }).click()
    // The rejection also releases holds and reservations in one transaction; allow for a cold dev server.
    await expect(statusPill(page)).toHaveText('Rejected', { timeout: 15000 })
    await logout(page)

    // The reservation is Released, with the time and the reason.
    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto('/equipment/reservations')
    const record = page.getByLabel(`Reservation for ${planning.core.title}`)
    await expect(record.locator('.status-pill')).toHaveText('Released')
    await expect(record.locator('.profile-row', { hasText: 'Released' })).toContainText('Event rejected')

    // Both projectors count as available again for the event's period.
    await page.goto('/equipment')
    await page.getByLabel('From', { exact: true }).fill('2026-11-20T09:00')
    await page.getByLabel('To', { exact: true }).fill('2026-11-20T13:00')
    await page.getByRole('button', { name: 'Check availability' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Portable projector' }).getByText('2 of 2')).toBeVisible()
  })
})
