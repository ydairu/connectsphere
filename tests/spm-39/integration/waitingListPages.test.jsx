// SPM-39, presentation side: the Join waiting list card on the event page (with its confirmation), the position on
// "My registrations", and the waiting-list count for the Organiser and Coordinator. The API is mocked; the rules and
// who may join are covered by waitingListApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import AttendeeRegistration from '../../../frontend/src/components/AttendeeRegistration.jsx'
import EventRegistrations from '../../../frontend/src/components/EventRegistrations.jsx'
import MyRegistrationsPage from '../../../frontend/src/pages/MyRegistrationsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, registerForEvent: vi.fn(), joinWaitingList: vi.fn(), listEventRegistrations: vi.fn(), listMyRegistrations: vi.fn() }
})

const { joinWaitingList, registerForEvent, listEventRegistrations, listMyRegistrations } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'att-2' }
const full = { canRegister: false, reason: 'full', canJoinWaitingList: true, waitingListPosition: null, opensAt: null, closesAt: '2026-11-19T00:00:00.000Z', placesLeft: 0, venueNames: [], myRegistration: null }
const waitlisted = { eventRequestId: 'req-1', status: 'waitlisted', waitingListPosition: 2, eventStatus: 'confirmed', eventTitle: 'Partner Forum', eventStartsAt: '2026-11-20T09:00:00.000Z', eventDurationHours: 3, venueNames: [], registeredAt: null }

function renderPage(element) {
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Bo' }, roles: ['attendee'], loading: false }}>
      <MemoryRouter><Routes><Route path="*" element={element} /></Routes></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-39 AC1 — a full event offers the waiting list', () => {
  it('spm39_a_full_event_says_so_and_offers_join_waiting_list_instead_of_register', () => {
    renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={full} />)
    expect(screen.getByText('This event is full.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join waiting list' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
  })
})

describe('SPM-39 AC3 — joining is confirmed first, then the position is shown', () => {
  it('spm39_the_attendee_confirms_joining_and_is_told_their_position', async () => {
    joinWaitingList.mockResolvedValue({ registration: { ...waitlisted, waitingListPosition: 1 } })
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={full} />)
    await actions.click(screen.getByRole('button', { name: 'Join waiting list' }))
    expect(joinWaitingList).not.toHaveBeenCalled()
    expect(screen.getByText(/You will be invited to register if a place becomes available/)).toBeTruthy()
    await actions.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(joinWaitingList).toHaveBeenCalledWith(user, 'req-1')
    expect(registerForEvent).not.toHaveBeenCalled()
    expect((await screen.findByRole('status', { name: 'On the waiting list' })).textContent).toContain('You are number 1 on the waiting list.')
  })

  it('spm39_cancelling_the_confirmation_does_not_join', async () => {
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={full} />)
    await actions.click(screen.getByRole('button', { name: 'Join waiting list' }))
    await actions.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(joinWaitingList).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Join waiting list' })).toBeTruthy()
  })

  it('spm39_an_attendee_already_waiting_sees_their_position', () => {
    renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...full, canJoinWaitingList: false, waitingListPosition: 2, myRegistration: waitlisted }} />)
    expect(screen.getByRole('status', { name: 'On the waiting list' }).textContent).toContain('You are number 2 on the waiting list.')
  })

  it('spm39_my_registrations_shows_the_waiting_list_position', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [waitlisted] })
    renderPage(<MyRegistrationsPage />)
    expect((await screen.findByRole('list', { name: 'My registrations' })).textContent).toContain('Status: Waitlisted, position 2')
  })
})

describe('SPM-39 AC2 — closed registration offers no waiting list', () => {
  it('spm39_a_closed_full_event_shows_only_the_reason', () => {
    renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...full, reason: 'closed', canJoinWaitingList: false }} />)
    expect(screen.getByText(/^Registration closed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Join waiting list' })).toBeNull()
  })
})

describe('SPM-39 — the Organiser and Coordinator see how many are waiting', () => {
  it('spm39_the_registrations_card_shows_the_waiting_list_count', async () => {
    listEventRegistrations.mockResolvedValue({ registeredCount: 1, capacity: 1, waitingListCount: 2, registrations: [] })
    renderPage(<EventRegistrations user={user} requestId="req-1" canView />)
    expect((await screen.findByText(/on the waiting list/)).textContent).toBe('2 on the waiting list')
  })
})
