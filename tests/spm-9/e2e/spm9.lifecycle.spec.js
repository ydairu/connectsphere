// SPM-9 end-to-end in Chromium: the Organiser and the assigned Coordinator see an event's current status
// and move it through review, return, resubmission, approval, staff sign-off, confirmation and an approved
// cancellation request from the request page. Firebase is the in-memory double; the API and app are real.

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { SUBMITTED } from '../../../shared/status.js'
import { DOUBLE_ORIGIN, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

// loginAs submits the form; the app lands on /profile. Wait for that before navigating.
async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

const submitted = SEED_REQUESTS.find(
  (request) =>
    request.status === SUBMITTED &&
    request.ownerUid === ROLE_USERS.organiser.uid &&
    request.assignedCoordinatorUid === ROLE_USERS.coordinator.uid,
)
const completed = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-completed')

const planning = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-planning')

const statusPill = (page) => page.locator('.page-heading .status-pill')
const arrangementValue = (page, label) => page.locator('.profile-row', { hasText: label }).locator('strong')

// Set-up through the real API served by the double, as the named account.
async function actAs(request, account, id, action) {
  const response = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${id}/transitions`, {
    headers: { Authorization: `Bearer test-token:${account.uid}` },
    data: { action },
  })
  expect(response.ok(), `${account.uid} ${action}`).toBeTruthy()
}

test.describe('SPM-9 — View an event’s current lifecycle status (E2E)', () => {
  test('spm9_coordinator_reviews_and_returns_then_organiser_resubmits_and_coordinator_approves', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${submitted.id}`)
    await expect(statusPill(page)).toHaveText('Submitted')

    await page.getByRole('button', { name: 'Start review' }).click()
    await expect(statusPill(page)).toHaveText('Under review')

    await page.getByRole('button', { name: 'Return for clarification' }).click()
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Return for clarification' }).click()
    await expect(statusPill(page)).toHaveText('Returned for clarification')
    await logout(page)

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(statusPill(page)).toHaveText('Returned for clarification')
    await page.getByRole('button', { name: 'Resubmit request' }).click()
    await expect(statusPill(page)).toHaveText('Submitted')
    // Once resubmitted, the Organiser has no further status actions.
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${submitted.id}`)
    await page.getByRole('button', { name: 'Start review' }).click()
    await expect(statusPill(page)).toHaveText('Under review')
    await page.getByRole('button', { name: 'Approve for planning' }).click()
    await expect(statusPill(page)).toHaveText('Planning')
    await expect(page.getByText('The event can be confirmed once all mandatory venue and technical arrangements are approved.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm event' })).toHaveCount(0)
  })

  test('spm9_a_completed_event_offers_no_status_actions_to_its_coordinator', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${completed.id}`)
    await expect(statusPill(page)).toHaveText('Completed')
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)
  })

  test('spm9_the_organiser_sees_status_but_no_coordinator_actions', async ({ page }) => {
    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${submitted.id}`)
    await expect(statusPill(page)).toHaveText('Submitted')
    await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0)
  })

  test('spm9_venue_and_technical_staff_sign_off_then_the_coordinator_confirms', async ({ page }) => {
    expect(planning.assignedCoordinatorUid).toBe(ROLE_USERS.coordinator.uid)
    expect(planning.assignedStaffUids).toEqual(expect.arrayContaining([ROLE_USERS.venueStaff.uid, ROLE_USERS.technicalStaff.uid]))

    await signIn(page, ROLE_USERS.venueStaff)
    await page.goto(`/requests/${planning.id}`)
    await expect(arrangementValue(page, 'Venue arrangement')).toHaveText('Awaiting approval')
    // Venue Staff cannot see the equipment section, so the technical sign-off is not shown to them.
    await expect(page.getByText('Technical arrangement')).toHaveCount(0)
    await page.getByRole('button', { name: 'Approve venue arrangement' }).click()
    await expect(arrangementValue(page, 'Venue arrangement')).toHaveText('Approved')
    await logout(page)

    await signIn(page, ROLE_USERS.technicalStaff)
    await page.goto(`/requests/${planning.id}`)
    await page.getByRole('button', { name: 'Approve technical arrangement' }).click()
    await expect(arrangementValue(page, 'Technical arrangement')).toHaveText('Approved')
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Planning')
    await page.getByRole('button', { name: 'Confirm event' }).click()
    await expect(statusPill(page)).toHaveText('Confirmed')
  })

  test('spm9_organiser_requests_cancellation_and_the_coordinator_approves_it', async ({ page }) => {
    await actAs(page.request, ROLE_USERS.venueStaff, planning.id, 'approve_venue')
    await actAs(page.request, ROLE_USERS.technicalStaff, planning.id, 'approve_technical')
    await actAs(page.request, ROLE_USERS.coordinator, planning.id, 'confirm')

    await signIn(page, ROLE_USERS.organiser)
    await page.goto(`/requests/${planning.id}`)
    await expect(statusPill(page)).toHaveText('Confirmed')
    await page.getByRole('button', { name: 'Request cancellation' }).click()
    await page.getByLabel('Reason (optional)').fill('Keynote speaker withdrew')
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Request cancellation' }).click()
    await expect(page.getByText(/awaiting the event coordinator/)).toBeVisible()
    await expect(statusPill(page)).toHaveText('Confirmed')
    await logout(page)

    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(`/requests/${planning.id}`)
    await expect(page.getByText('Keynote speaker withdrew')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel event' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Approve cancellation' }).click()
    await page.getByRole('group', { name: 'Confirm status change' }).getByRole('button', { name: 'Approve cancellation' }).click()
    await expect(statusPill(page)).toHaveText('Cancelled')
    await expect(page.getByRole('heading', { name: 'Status actions' })).toHaveCount(0)
  })
})
