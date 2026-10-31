// SPM-84, presentation side: the assignment notices on the Notifications page. The new Coordinator's and the
// Organiser's open the event; the previous Coordinator's shows its message with no link but can still be marked as
// read. The API is mocked; who receives what is the API suite.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import NotificationsPage from '../../../frontend/src/pages/NotificationsPage.jsx'
import {
  EVENT_ASSIGNED_TO_YOU_NOTICE,
  EVENT_COORDINATOR_ASSIGNED_NOTICE,
  EVENT_REASSIGNED_AWAY_NOTICE,
  NEW_UNASSIGNED_REQUEST_NOTICE,
} from '../../../shared/notifications.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listNotifications: vi.fn(), markNotificationRead: vi.fn() }
})

const { listNotifications, markNotificationRead } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const displayed = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const START = '2026-12-10T06:00:00.000Z'
const base = { eventRequestId: 'req-1', eventTitle: 'Partner forum', createdAt: '2026-10-30T02:00:00.000Z', readAt: null, reason: null }
const toYou = { ...base, id: 'n-1', type: EVENT_ASSIGNED_TO_YOU_NOTICE, change: 'reassigned', message: '“Partner forum” has been reassigned to you.', eventStartsAt: START }
const away = { ...base, id: 'n-2', type: EVENT_REASSIGNED_AWAY_NOTICE, change: 'reassigned', message: '“Partner forum” has been reassigned to Ada. You no longer manage it.' }
const organiser = { ...base, id: 'n-3', type: EVENT_COORDINATOR_ASSIGNED_NOTICE, change: 'assigned', message: 'Ada is now the Event Coordinator for “Partner forum”.', eventStartsAt: START }

function showPage(notifications) {
  listNotifications.mockResolvedValue({ notifications })
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Someone' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const item = async (message) => (await screen.findByRole('heading', { name: message })).closest('li')

describe('SPM-84 AC3 — the notice opens the event', () => {
  it('spm84_the_new_coordinators_notice_links_to_the_event_and_shows_its_start', async () => {
    showPage([toYou])
    const row = await item(toYou.message)
    expect(within(row).getByRole('link', { name: 'View event' }).getAttribute('href')).toBe('/requests/req-1')
    expect(row.textContent).toContain(`Event starts: ${displayed(START)}`)
  })

  it('spm84_the_organisers_notice_names_the_coordinator_and_links_to_the_event', async () => {
    showPage([organiser])
    const row = await item(organiser.message)
    expect(within(row).getByRole('link', { name: 'View event' }).getAttribute('href')).toBe('/requests/req-1')
  })
})

describe('SPM-84 AC5 — the previous Coordinator’s notice has no link', () => {
  it('spm84_shows_the_message_with_no_link_and_can_be_marked_as_read', async () => {
    markNotificationRead.mockResolvedValue({ notification: { ...away, readAt: '2026-10-30T03:00:00.000Z' } })
    const user = showPage([away])
    const row = await item(away.message)
    expect(within(row).queryByRole('link')).toBeNull()
    expect(row.textContent).not.toContain('Event starts')

    await user.click(within(row).getByRole('button', { name: 'Mark as read' }))
    expect(markNotificationRead).toHaveBeenCalledWith(expect.anything(), 'n-2')
    expect((await item(away.message)).textContent).toContain('Read')
    expect(within(await item(away.message)).queryByRole('button', { name: 'Mark as read' })).toBeNull()
  })

  it('spm84_other_notices_beside_it_keep_their_links', async () => {
    const queue = { ...base, id: 'n-4', type: NEW_UNASSIGNED_REQUEST_NOTICE, message: 'New request “Winter gala” is waiting for assignment.' }
    showPage([away, toYou, queue])
    expect(within(await item(away.message)).queryByRole('link')).toBeNull()
    expect(within(await item(toYou.message)).getByRole('link', { name: 'View event' })).toBeTruthy()
    expect(within(await item(queue.message)).getByRole('link', { name: 'View unassigned requests' }).getAttribute('href')).toBe('/requests/unassigned')
  })
})
