// SPM-61, presentation side: the notifications page shows the Organiser's status-change notices with the event
// name, the message or reason, and a link to the event — "Edit request" for a return, "View arrangements" for a
// confirmation. The API is mocked; who receives what is covered by organiserStatusNotificationsApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import NotificationsPage from '../../../frontend/src/pages/NotificationsPage.jsx'
import {
  REQUEST_APPROVED_NOTICE,
  REQUEST_CONFIRMED_NOTICE,
  REQUEST_REJECTED_NOTICE,
  REQUEST_RETURNED_NOTICE,
} from '../../../shared/notifications.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listNotifications: vi.fn(), markNotificationRead: vi.fn() }
})

const { listNotifications } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const base = { eventTitle: 'Partner Forum', createdAt: '2026-11-01T02:00:00.000Z', readAt: null, reason: null }
const returned = {
  ...base,
  id: 'n-return',
  type: REQUEST_RETURNED_NOTICE,
  eventRequestId: 'req-1',
  message: 'The event coordinator returned “Partner Forum” for clarification. Update the request and resubmit it.',
  reason: 'Please confirm the expected attendance.',
}
const confirmed = {
  ...base,
  id: 'n-confirm',
  type: REQUEST_CONFIRMED_NOTICE,
  eventRequestId: 'req-2',
  eventTitle: 'Board Dinner',
  message: '“Board Dinner” is confirmed. Its required venue and technical arrangements have been approved.',
}
const rejected = {
  ...base,
  id: 'n-reject',
  type: REQUEST_REJECTED_NOTICE,
  eventRequestId: 'req-3',
  message: '“Team Offsite” has been rejected during review.',
  reason: 'The venue cannot hold the expected attendance.',
}
const approved = {
  ...base,
  id: 'n-approve',
  type: REQUEST_APPROVED_NOTICE,
  eventRequestId: 'req-4',
  message: '“Launch Party” has been approved and moved to Planning. The event coordinator will now arrange the venue and equipment.',
}

function RequestStub() {
  const { id } = useParams()
  return <p>Request page {id}</p>
}

function showNotifications(list) {
  listNotifications.mockResolvedValue({ notifications: list })
  render(
    <AuthContext.Provider value={{ user: { uid: 'org-1' }, userProfile: { name: 'Organiser' }, roles: ['organiser'], loading: false }}>
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/requests/:id" element={<RequestStub />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const itemFor = async (message) => (await screen.findByText(message)).closest('li')

describe('SPM-61 — the Organiser’s status-change notices', () => {
  it('spm61_a_return_shows_the_event_name_the_coordinators_message_and_an_edit_link', async () => {
    const user = showNotifications([returned])
    const item = await itemFor(returned.message)
    expect(item.textContent).toContain('Partner Forum')
    expect(item.textContent).toContain('Message from the coordinator: Please confirm the expected attendance.')
    expect(item.textContent).not.toContain('Reason:')
    await user.click(screen.getByRole('link', { name: 'Edit request' }))
    expect(await screen.findByText('Request page req-1')).toBeTruthy()
  })

  it('spm61_a_confirmation_links_to_the_confirmed_arrangements_on_the_event_page', async () => {
    showNotifications([confirmed])
    await itemFor(confirmed.message)
    expect(screen.getByRole('link', { name: 'View arrangements' }).getAttribute('href')).toBe('/requests/req-2')
  })

  it('spm61_a_rejection_shows_its_reason_and_an_approval_links_to_the_event', async () => {
    showNotifications([rejected, approved])
    const rejectedItem = await itemFor(rejected.message)
    expect(rejectedItem.textContent).toContain('Reason: The venue cannot hold the expected attendance.')
    const approvedItem = await itemFor(approved.message)
    expect(approvedItem.textContent).not.toContain('Reason:')
    const links = screen.getAllByRole('link', { name: 'View event' }).map((link) => link.getAttribute('href'))
    expect(links).toEqual(['/requests/req-3', '/requests/req-4'])
  })
})
