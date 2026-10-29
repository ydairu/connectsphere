// SPM-41, presentation side: an Attendee's cancellation and reschedule notices on the Notifications page, and a
// cancelled or rescheduled event on "My registrations". The API is mocked; who receives what is the API suite.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import MyRegistrationsPage from '../../../frontend/src/pages/MyRegistrationsPage.jsx'
import NotificationsPage from '../../../frontend/src/pages/NotificationsPage.jsx'
import { ATTENDEE_EVENT_CANCELLED_NOTICE, EVENT_RESCHEDULED_NOTICE } from '../../../shared/notifications.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listNotifications: vi.fn(), markNotificationRead: vi.fn(), listMyRegistrations: vi.fn() }
})

const { listNotifications, listMyRegistrations } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const displayed = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const base = { eventRequestId: 'req-1', eventTitle: 'Partner Forum', createdAt: '2026-11-01T02:00:00.000Z', readAt: null, reason: null }
const cancelled = { ...base, id: 'n-1', type: ATTENDEE_EVENT_CANCELLED_NOTICE, changeType: 'cancelled', message: '“Partner Forum”, which you registered for, has been cancelled.' }
const rescheduled = {
  ...base,
  id: 'n-2',
  type: EVENT_RESCHEDULED_NOTICE,
  changeType: 'rescheduled',
  message: '“Partner Forum”, which you registered for, has been rescheduled.',
  eventStartsAt: '2026-11-27T10:00:00.000Z',
  eventEndsAt: '2026-11-27T13:00:00.000Z',
  previousStartsAt: '2026-11-20T09:00:00.000Z',
  previousEndsAt: '2026-11-20T12:00:00.000Z',
}

function renderAt(path, element) {
  render(
    <AuthContext.Provider value={{ user: { uid: 'att-1' }, userProfile: { name: 'Ada' }, roles: ['attendee'], loading: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SPM-41 AC5 / E4 — the Attendee\'s notices', () => {
  it('spm41_a_cancellation_notice_names_the_event_and_links_to_my_registrations', async () => {
    listNotifications.mockResolvedValue({ notifications: [cancelled] })
    renderAt('/notifications', <NotificationsPage />)
    expect(await screen.findByText(cancelled.message)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View my registrations' }).getAttribute('href')).toBe('/registrations')
    expect(screen.queryByRole('link', { name: 'View event' })).toBeNull()
  })

  it('spm41_a_reschedule_notice_shows_the_new_and_previous_date_and_time', async () => {
    listNotifications.mockResolvedValue({ notifications: [rescheduled] })
    renderAt('/notifications', <NotificationsPage />)
    const item = (await screen.findByText(rescheduled.message)).closest('li')
    expect(item.textContent).toContain(`New date and time: ${displayed(rescheduled.eventStartsAt)} to ${displayed(rescheduled.eventEndsAt)}`)
    expect(item.textContent).toContain(`Previously: ${displayed(rescheduled.previousStartsAt)} to ${displayed(rescheduled.previousEndsAt)}`)
    expect(screen.getByRole('link', { name: 'View my registrations' }).getAttribute('href')).toBe('/registrations')
  })
})

describe('SPM-41 E3 — My registrations shows the event as it now is', () => {
  const registration = { eventRequestId: 'req-1', status: 'registered', eventTitle: 'Partner Forum', eventStartsAt: '2026-11-27T10:00:00.000Z', eventDurationHours: 3, venueNames: [], registeredAt: '2026-11-01T00:00:00.000Z' }

  it('spm41_a_cancelled_event_is_marked_and_its_page_link_is_not_offered', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [{ ...registration, eventStatus: 'cancelled' }] })
    renderAt('/registrations', <MyRegistrationsPage />)
    const list = await screen.findByRole('list', { name: 'My registrations' })
    expect(list.textContent).toContain('Event cancelled')
    expect(screen.queryByRole('link', { name: 'View event' })).toBeNull()
  })

  it('spm41_an_event_moved_back_to_planning_says_it_is_being_rearranged', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [{ ...registration, eventStatus: 'planning' }] })
    renderAt('/registrations', <MyRegistrationsPage />)
    const list = await screen.findByRole('list', { name: 'My registrations' })
    expect(list.textContent).toContain('Event being rearranged')
    expect(list.textContent).toContain(displayed(registration.eventStartsAt))
    expect(screen.queryByRole('link', { name: 'View event' })).toBeNull()
  })

  it('spm41_a_confirmed_event_still_links_to_its_page', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [{ ...registration, eventStatus: 'confirmed' }] })
    renderAt('/registrations', <MyRegistrationsPage />)
    expect((await screen.findByRole('link', { name: 'View event' })).getAttribute('href')).toBe('/requests/req-1')
  })
})
