// SPM-47, SPM-63 — the notifications page shows the signed-in user's notifications, as the API returns
// them. The API is mocked; who receives what is covered in tests/spm-63 and tests/spm-47.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import NotificationsPage from './NotificationsPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listNotifications: vi.fn(), markNotificationRead: vi.fn() }
})

const { listNotifications, markNotificationRead } = await import('../services/api.js')

afterEach(cleanup)

const notice = {
  id: 'n-1',
  type: 'event_cancelled',
  message: '“A1 confirmed” has been cancelled by the event coordinator.',
  reason: 'Venue closed for repairs',
  eventRequestId: 'req-1',
  eventTitle: 'A1 confirmed',
  createdAt: '2026-11-01T02:00:00.000Z',
  readAt: null,
}

function showNotifications(list) {
  listNotifications.mockResolvedValue({ notifications: list })
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Tester' }, roles: ['organiser'], loading: false }}>
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/requests/:id" element={<p>Request detail</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-63 / SPM-47 — notifications page', () => {
  it('spm63_shows_the_cancellation_notice_with_its_reason_and_a_link_to_the_event', async () => {
    showNotifications([notice])
    expect(await screen.findByText(notice.message)).toBeTruthy()
    expect(screen.getByText('Reason: Venue closed for repairs')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View event' }).getAttribute('href')).toBe('/requests/req-1')
    expect(screen.getByText(/^Unread/)).toBeTruthy()
  })

  it('spm63_marks_a_notice_read', async () => {
    const user = showNotifications([notice])
    markNotificationRead.mockResolvedValue({ notification: { ...notice, readAt: '2026-11-01T03:00:00.000Z' } })
    await user.click(await screen.findByRole('button', { name: 'Mark as read' }))
    expect(markNotificationRead).toHaveBeenCalledWith({ uid: 'u-1' }, 'n-1')
    expect(await screen.findByText(/^Read/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
  })

  it('spm63_says_so_when_there_are_none', async () => {
    showNotifications([])
    expect(await screen.findByText('No notifications')).toBeTruthy()
  })
})
