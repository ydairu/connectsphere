// SPM-19, presentation side: the Attendee's Register card, the registered list for the Organiser and
// Coordinator, and "My registrations". The API is mocked; who may do what is covered by registrationApi.test.js.

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
  return { ...actual, registerForEvent: vi.fn(), listEventRegistrations: vi.fn(), listMyRegistrations: vi.fn() }
})

const { registerForEvent, listEventRegistrations, listMyRegistrations } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'att-1' }
const registration = {
  eventRequestId: 'req-1',
  status: 'registered',
  eventTitle: 'Partner Forum',
  eventStartsAt: '2026-11-20T09:00:00.000Z',
  eventDurationHours: 3,
  venueNames: ['Seed Hall'],
  registeredAt: '2026-11-01T00:00:00.000Z',
}
const open = { canRegister: true, reason: null, opensAt: '2026-10-25T00:00:00.000Z', closesAt: '2026-11-19T00:00:00.000Z', placesLeft: 2, venueNames: ['Seed Hall'], myRegistration: null }

function renderWithRouter(element) {
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Ada' }, roles: ['attendee'], loading: false }}>
      <MemoryRouter>
        <Routes><Route path="*" element={element} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-19 — the Attendee registers from the event page', () => {
  it('spm19_an_open_event_offers_register_and_confirms_with_name_time_and_venue', async () => {
    registerForEvent.mockResolvedValue({ registration })
    const actions = renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={open} />)
    expect(screen.getByText(/2 places left\./)).toBeTruthy()
    await actions.click(screen.getByRole('button', { name: 'Register' }))
    expect(registerForEvent).toHaveBeenCalledWith(user, 'req-1')
    const confirmation = await screen.findByRole('status', { name: 'Registration confirmed' })
    expect(confirmation.textContent).toContain('You are registered for Partner Forum.')
    expect(confirmation.textContent).toContain('Venue: Seed Hall')
    expect(confirmation.textContent).toMatch(/Date and time: .*2026/)
    expect(screen.getByRole('link', { name: 'View my registrations' }).getAttribute('href')).toBe('/registrations')
  })

  it('spm19_the_reason_is_shown_when_registration_is_unavailable', () => {
    renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...open, canRegister: false, reason: 'full', placesLeft: 0 }} />)
    expect(screen.getByText('This event is full.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
  })

  it('spm19_not_yet_open_names_the_opening_time', () => {
    renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...open, canRegister: false, reason: 'not_open_yet' }} />)
    expect(screen.getByText(/^Registration opens .*2026/)).toBeTruthy()
  })

  it('spm19_a_refusal_on_submit_is_shown_as_the_api_words_it', async () => {
    registerForEvent.mockRejectedValue(Object.assign(new Error('409'), { status: 409, details: { message: 'This event is full.', reason: 'full' } }))
    const actions = renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...open, placesLeft: 1 }} />)
    await actions.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('This event is full.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
  })

  it('spm19_an_existing_registration_is_shown_instead_of_the_button', () => {
    renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...open, canRegister: false, reason: 'already_registered', myRegistration: registration }} />)
    expect(screen.getByRole('status', { name: 'Registration confirmed' })).toBeTruthy()
  })

  it('spm19_nothing_is_rendered_for_users_the_api_sent_no_summary_to', () => {
    renderWithRouter(<AttendeeRegistration user={user} requestId="req-1" summary={null} />)
    expect(screen.queryByRole('region', { name: 'Registration' })).toBeNull()
  })
})

describe('SPM-19 — the registered list', () => {
  it('spm19_the_organiser_or_coordinator_sees_the_count_and_each_attendee', async () => {
    listEventRegistrations.mockResolvedValue({ registeredCount: 1, capacity: 2, registrations: [{ name: 'Ada', email: 'ada@example.test', status: 'registered', registeredAt: '2026-11-01T00:00:00.000Z' }] })
    renderWithRouter(<EventRegistrations user={user} requestId="req-1" canView />)
    const list = await screen.findByRole('list', { name: 'Registered attendees' })
    expect(list.textContent).toContain('Ada · ada@example.test · Registered')
    expect(screen.getByRole('region', { name: 'Registrations' }).textContent).toContain('1 registered of 2 places')
  })

  it('spm19_the_list_is_not_requested_for_users_who_may_not_see_it', () => {
    renderWithRouter(<EventRegistrations user={user} requestId="req-1" canView={false} />)
    expect(listEventRegistrations).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Registrations' })).toBeNull()
  })
})

describe('SPM-19 — My registrations', () => {
  it('spm19_lists_each_registration_with_its_status_and_event_details', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [registration] })
    renderWithRouter(<MyRegistrationsPage />)
    const list = await screen.findByRole('list', { name: 'My registrations' })
    expect(list.textContent).toContain('Partner Forum')
    expect(list.textContent).toContain('Seed Hall')
    expect(list.textContent).toContain('Status: Registered')
    expect(screen.getByRole('link', { name: 'View event' }).getAttribute('href')).toBe('/requests/req-1')
  })

  it('spm19_says_so_when_there_are_none', async () => {
    listMyRegistrations.mockResolvedValue({ registrations: [] })
    renderWithRouter(<MyRegistrationsPage />)
    expect(await screen.findByText('No registrations')).toBeTruthy()
  })
})
