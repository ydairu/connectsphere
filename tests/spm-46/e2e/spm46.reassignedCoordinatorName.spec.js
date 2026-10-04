// Cross-story E2E: SPM-46 × SPM-26, in Chromium. The assigned Coordinator reassigns the Organiser's event
// through the real SPM-26 API; the Organiser then opens the event and sees the new Coordinator's name.
// Firebase is the in-memory double; the API and app are real. Not an SPM-64 test.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { SUBMITTED } from '../../../shared/status.js'
import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, test } from '../../shared/e2e/fixtures.js'

const FROM = ROLE_USERS.coordinator
const TO = EXTRA_USERS.secondCoordinator

const submitted = SEED_REQUESTS.find(
  (request) => request.status === SUBMITTED && request.ownerUid === ROLE_USERS.organiser.uid && request.assignedCoordinatorUid === FROM.uid,
)

test.describe('SPM-46 × SPM-26 — the Organiser sees the reassigned Coordinator (E2E)', () => {
  test('spm46_spm26_organiser_sees_the_new_coordinator_after_reassignment', async ({ page }) => {
    expect(submitted).toBeDefined()

    // Set-up through the real API served by the double, as the assigned Coordinator.
    const response = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests/${submitted.id}/reassignment`, {
      headers: { Authorization: `Bearer test-token:${FROM.uid}` },
      data: { coordinatorUid: TO.uid, handoverAgreed: true },
    })
    expect(response.ok()).toBeTruthy()
    expect(await response.json()).toEqual({ reassigned: true, coordinator: { name: TO.name } })

    await loginAs(page, ROLE_USERS.organiser)
    await expect(page).toHaveURL(/\/profile$/)
    await page.goto(`/requests/${submitted.id}`)

    const row = page.locator('.profile-row', { hasText: 'Event Coordinator' })
    await expect(row.locator('strong')).toHaveText(TO.name)
    await expect(page.locator('body')).not.toContainText(TO.uid)
  })
})
