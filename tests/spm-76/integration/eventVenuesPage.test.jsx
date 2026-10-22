// SPM-76, presentation side: the Venue suitability card lists each of the event's venues on its own, then the
// catalogue. The API is mocked here; the rules and their enforcement are covered by the unit and API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { PLANNING } from '../../../shared/status.js'
import { SUITABLE, UNSUITABLE } from '../../../shared/venueSuitability.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import VenueBookingsPage from '../../../frontend/src/pages/VenueBookingsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), getVenueBookings: vi.fn(), getVenueSuitability: vi.fn() }
})

const { getRequest, getVenueBookings, getVenueSuitability } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const coordinatorUser = { uid: 'seed-coordinator' }

function requestResponse({ venue = {}, canCheckVenueSuitability = true } = {}) {
  return {
    request: {
      id: 'req-1',
      status: PLANNING,
      core: { title: 'Partner summit', expectedAttendees: 80 },
      venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Two wheelchair users', ...venue },
    },
    editableSections: ['core', 'venue'],
    availableActions: [],
    canCheckVenueSuitability,
  }
}

const BUFFER_MESSAGE =
  'Not available: already booked, Fri 20 Nov 2026, 06:30–08:15. The venue needs 45 minutes of turnaround after it and 30 minutes of setup before the event, which overlap.'

function suitabilityResponse({ eventVenues } = {}) {
  const atrium = { id: 'atrium', name: 'Atrium Hall', location: 'Main Campus', maximumCapacity: 100, result: SUITABLE, problems: [], warnings: [] }
  const lecture = {
    id: 'lecture',
    name: 'Lecture Hall',
    location: 'East Wing',
    maximumCapacity: 120,
    result: UNSUITABLE,
    problems: [{ check: 'availability', message: BUFFER_MESSAGE }],
    warnings: [],
  }
  return {
    event: {
      period: { label: 'Fri 20 Nov 2026, 09:00–13:00' },
      expectedAttendees: 80,
      layoutPreference: 'theatre',
      accessibilityRequired: false,
      accessibilityNeeds: null,
      requiredFacilities: [],
      requiredAccessibilityFeatures: [],
    },
    eventVenues: eventVenues ?? [
      { ...lecture, bookingId: 'b-2', venueNeedId: 'n-2', bookingStatus: 'approved' },
      { ...atrium, bookingId: 'b-1', venueNeedId: 'n-1', bookingStatus: 'pending' },
    ],
    venues: [atrium, lecture],
    options: { facilities: [], accessibilityFeatures: [] },
  }
}

function showRequest() {
  const response = requestResponse()
  getRequest.mockResolvedValue(response)
  getVenueBookings.mockResolvedValue({ event: response.request, canSubmit: false, bookings: [] })
  render(
    <AuthContext.Provider value={{ user: coordinatorUser, userProfile: { name: 'Seed Coordinator' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1/venue-bookings?tab=recommendations']}>
        <Routes>
          <Route path="/requests/:id/venue-bookings" element={<VenueBookingsPage />} />
          <Route path="/venues/:id" element={<p>Venue detail page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

async function eventVenueItems() {
  const heading = await screen.findByRole('heading', { name: "This event's venues" })
  const section = heading.closest('section')
  return { section, items: within(section).queryAllByRole('listitem').filter((item) => item.classList.contains('suitability-item')) }
}

describe('SPM-76 — each of the event’s venues on the Venue suitability card', () => {
  it('spm76_frontend_shows_each_event_venue_separately_with_its_own_result_and_problems', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const { section, items } = await eventVenueItems()

    expect(within(section).getByRole('list', { name: 'Event venue suitability results' })).toBeTruthy()
    expect(items.map((item) => [within(item).getByRole('heading').textContent, item.querySelector('.suitability-badge').textContent])).toEqual([
      ['Lecture Hall', 'Unsuitable'],
      ['Atrium Hall', 'Suitable'],
    ])
    expect(items.map((item) => item.querySelector('.request-meta').textContent)).toEqual([
      'Request approved · East Wing · Capacity 120',
      'Request pending · Main Campus · Capacity 100',
    ])
  })

  it('spm76_frontend_names_the_failing_venues_problem_and_leaves_the_passing_venue_without_any', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const { items } = await eventVenueItems()
    const [failing, passing] = items

    expect(within(failing).getByText('Why it is unsuitable')).toBeTruthy()
    expect(within(failing).getByText(BUFFER_MESSAGE)).toBeTruthy()
    expect(within(passing).queryByText('Why it is unsuitable')).toBeNull()
    expect(within(passing).queryByText('Warnings')).toBeNull()
  })

  it('spm76_frontend_still_lists_every_catalogue_venue_under_its_own_heading', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const heading = await screen.findByRole('heading', { name: 'All catalogue venues' })
    const results = within(heading.closest('section')).getByRole('list', { name: 'Venue suitability results' })

    expect(within(results).getAllByRole('heading').map((item) => item.textContent)).toEqual(['Atrium Hall', 'Lecture Hall'])
  })

  it('spm76_frontend_says_when_the_event_has_no_venue_request_yet', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse({ eventVenues: [] }))
    showRequest()
    const { section, items } = await eventVenueItems()

    expect(items).toEqual([])
    expect(within(section).getByText(/no pending or approved venue request yet/)).toBeTruthy()
  })

  it('spm76_frontend_explains_that_setup_and_turnaround_count_towards_availability', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()

    expect(await screen.findByText(/setup time before the event and turnaround time after it/)).toBeTruthy()
  })
})
