// SPM-85, presentation side: the Lead's new-request notice on the Notifications page shows its message and the
// event's start, and links to the unassigned queue rather than the event. The API is mocked; who receives what is
// the API suite.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import NotificationsPage from '../../../frontend/src/pages/NotificationsPage.jsx'
import { EVENT_RESCHEDULED_NOTICE, NEW_UNASSIGNED_REQUEST_NOTICE, REQUEST_APPROVED_NOTICE } from '../../../shared/notifications.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listNotifications: vi.fn(), markNotificationRead: vi.fn() }
})

const { listNotifications } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const displayed = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const base = { createdAt: '2026-10-29T02:00:00.000Z', readAt: null, reason: null, type: NEW_UNASSIGNED_REQUEST_NOTICE }
const forum = {
  ...base,
  id: 'n-1',
  eventRequestId: 'req-forum',
  eventTitle: 'Partner forum',
  message: 'New request “Partner forum” from Seed Organisation A is waiting for assignment.',
  eventStartsAt: '2026-12-10T06:00:00.000Z',
}
const gala = {
  ...base,
  id: 'n-2',
  eventRequestId: 'req-gala',
  eventTitle: 'Winter gala',
  message: 'New request “Winter gala” from Seed Organisation B is waiting for assignment.',
  eventStartsAt: '2026-12-20T11:00:00.000Z',
}

function showPage(notifications) {
  listNotifications.mockResolvedValue({ notifications })
  render(
    <AuthContext.Provider value={{ user: { uid: 'seed-coordinator-lead' }, userProfile: { name: 'Seed Coordinator Lead' }, roles: ['coordinator_lead'], loading: false }}>
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const item = async (message) => (await screen.findByRole('heading', { name: message })).closest('li')

describe('SPM-85 AC1 — the Lead\'s notice', () => {
  it('spm85_shows_the_message_and_the_event_start_and_links_to_the_queue', async () => {
    showPage([forum])
    const row = await item(forum.message)
    expect(row.textContent).toContain(`Event starts: ${displayed(forum.eventStartsAt)}`)
    expect(within(row).getByRole('link', { name: 'View unassigned requests' }).getAttribute('href')).toBe('/requests/unassigned')
    expect(within(row).queryByRole('link', { name: 'View event' })).toBeNull()
  })
})

describe('SPM-85 AC2 — several notices each name their event', () => {
  it('spm85_two_notices_are_listed_separately_each_with_its_own_event_and_date', async () => {
    showPage([gala, forum])
    const galaRow = await item(gala.message)
    const forumRow = await item(forum.message)
    expect(galaRow).not.toBe(forumRow)
    expect(galaRow.textContent).toContain(displayed(gala.eventStartsAt))
    expect(forumRow.textContent).toContain(displayed(forum.eventStartsAt))
    expect(screen.getAllByRole('link', { name: 'View unassigned requests' })).toHaveLength(2)
  })
})

describe('SPM-85 — other notices keep their links', () => {
  it('spm85_an_organiser_notice_still_links_to_the_event_and_an_attendee_notice_to_my_registrations', async () => {
    showPage([
      { ...base, id: 'n-3', type: REQUEST_APPROVED_NOTICE, eventRequestId: 'req-1', eventTitle: 'A', message: 'Approved A', eventStartsAt: undefined },
      { ...base, id: 'n-4', type: EVENT_RESCHEDULED_NOTICE, eventRequestId: 'req-2', eventTitle: 'B', message: 'Rescheduled B', eventStartsAt: undefined },
    ])
    expect(within(await item('Approved A')).getByRole('link', { name: 'View event' }).getAttribute('href')).toBe('/requests/req-1')
    expect(within(await item('Rescheduled B')).getByRole('link', { name: 'View my registrations' }).getAttribute('href')).toBe('/registrations')
  })
})
