// SPM-85 end-to-end in Chromium: the Organiser submits a request; the Event Coordinator Lead opens Notifications,
// reads the new-request notice (event, organisation and start) and follows "View unassigned requests" to the queue,
// which lists the request. Firebase is the in-memory double; the API and app are real. The draft is created through
// the API so the test starts from a complete request; the submission itself is the Organiser's click.

import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const LEAD = EXTRA_USERS.coordinatorLead
const ORGANISER = ROLE_USERS.organiser
const TITLE = 'SPM-85 partner briefing'
const START = '2027-03-04T10:00:00.000Z'
const auth = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test.describe('SPM-85 — the Event Coordinator Lead is notified of a new request (E2E)', () => {
  test('spm85_lead_is_notified_and_follows_the_notice_to_the_queue', async ({ page }) => {
    const created = await page.request.post(`${DOUBLE_ORIGIN}/api/event-requests`, {
      headers: auth(ORGANISER),
      data: {
        core: { title: TITLE, purpose: 'SPM-85', expectedAttendees: 40, durationHours: 3, preferredDateTime: START },
        venue: { layoutPreference: 'theatre' },
      },
    })
    expect(created.status()).toBe(201)
    const { id } = (await created.json()).eventRequest

    // The Organiser submits it.
    await signIn(page, ORGANISER)
    await page.goto(`/event-requests/${id}/edit`)
    await page.getByRole('button', { name: 'Submit request' }).click()
    await expect(page.getByRole('heading', { name: 'Submitted for review' })).toBeVisible()
    await logout(page)

    // AC1: the Lead's notice names the event and organisation, shows the start, and leads to the queue.
    await signIn(page, LEAD)
    await page.getByRole('link', { name: 'Notifications' }).click()
    const notice = page.getByRole('listitem').filter({ hasText: TITLE })
    await expect(notice.getByRole('heading')).toHaveText(`New request “${TITLE}” from ${ORGANISER.organisationName} is waiting for assignment.`)
    await expect(notice).toContainText('Event starts:')
    await notice.getByRole('link', { name: 'View unassigned requests' }).click()

    await expect(page).toHaveURL(/\/requests\/unassigned$/)
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
  })
})
