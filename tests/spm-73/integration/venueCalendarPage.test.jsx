// SPM-73 — the availability calendar page shows setup and turnaround apart from the event time.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { COORDINATOR } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SETUP_SLOT, TURNAROUND_SLOT } from '../../../shared/venueCalendar.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import VenueAvailabilityPage from '../../../frontend/src/pages/VenueAvailabilityPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getVenueAvailability: vi.fn(), listVenues: vi.fn() }
})

const { getVenueAvailability, listVenues } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function calendar(buffers) {
  return {
    range: { from: '2026-11-02T00:00:00.000Z', to: '2026-11-02T06:00:00.000Z' },
    buffers,
    slots: [
      { status: AVAILABILITY_STATUS.AVAILABLE, startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-02T01:30:00.000Z' },
      {
        status: SETUP_SLOT,
        commitmentId: 'booking-1',
        commitmentStatus: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: '2026-11-02T01:30:00.000Z',
        endsAt: '2026-11-02T02:00:00.000Z',
        title: 'Annual meeting',
      },
      {
        id: 'booking-1',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: '2026-11-02T02:00:00.000Z',
        endsAt: '2026-11-02T04:00:00.000Z',
        title: 'Annual meeting',
      },
      {
        status: TURNAROUND_SLOT,
        commitmentId: 'booking-1',
        commitmentStatus: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: '2026-11-02T04:00:00.000Z',
        endsAt: '2026-11-02T04:45:00.000Z',
        title: 'Annual meeting',
      },
      { status: AVAILABILITY_STATUS.AVAILABLE, startsAt: '2026-11-02T04:45:00.000Z', endsAt: '2026-11-02T06:00:00.000Z' },
    ],
  }
}

async function showCalendar(availability) {
  listVenues.mockResolvedValue({ venues: [{ id: 'hall', name: 'Seed Hall' }] })
  getVenueAvailability.mockResolvedValue({ availability })
  render(
    <AuthContext.Provider value={{ user: { uid: 'user-1' }, userProfile: { name: 'User One' }, roles: [COORDINATOR], loading: false }}>
      <MemoryRouter initialEntries={['/venues/hall/availability']}>
        <Routes>
          <Route path="/venues/:id/availability" element={<VenueAvailabilityPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  await screen.findByRole('heading', { name: 'Seed Hall' })
}

describe('SPM-73 — calendar page with setup and turnaround', () => {
  it('spm73_frontend_shows_setup_and_turnaround_as_their_own_slots_around_the_event', async () => {
    await showCalendar(calendar({ setupMinutes: 30, turnaroundMinutes: 45 }))

    const items = within(screen.getByRole('list', { name: 'Availability slots' })).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('strong').textContent)).toEqual([
      'Available',
      'Setup',
      'Confirmed booking',
      'Turnaround',
      'Available',
    ])
    expect(within(items[1]).getByText('Before Annual meeting')).toBeTruthy()
    expect(within(items[2]).getByText('Annual meeting')).toBeTruthy()
    expect(within(items[3]).getByText('After Annual meeting')).toBeTruthy()
  })

  it('spm73_frontend_draws_setup_and_turnaround_differently_from_the_event_time', async () => {
    await showCalendar(calendar({ setupMinutes: 30, turnaroundMinutes: 45 }))

    const items = within(screen.getByRole('list', { name: 'Availability slots' })).getAllByRole('listitem')
    expect(items[1].className).toContain('availability-slot-setup')
    expect(items[2].className).toContain('availability-slot-confirmed-booking')
    expect(items[3].className).toContain('availability-slot-turnaround')
    const legend = screen.getByLabelText('Availability legend')
    expect(within(legend).getByText('Setup').className).toContain('availability-slot-setup')
    expect(within(legend).getByText('Turnaround').className).toContain('availability-slot-turnaround')
  })

  it('spm73_frontend_states_the_venues_setup_and_turnaround_times', async () => {
    await showCalendar(calendar({ setupMinutes: 30, turnaroundMinutes: 45 }))

    expect(
      screen.getByText(
        'This venue needs 30 minutes of setup before and 45 minutes of turnaround after each booking or hold. Those periods are unavailable.',
      ),
    ).toBeTruthy()
  })

  it('spm73_frontend_says_when_the_venue_has_no_setup_or_turnaround', async () => {
    await showCalendar({ ...calendar({ setupMinutes: 0, turnaroundMinutes: 0 }), slots: [] })

    expect(screen.getByText('This venue has no setup or turnaround time.')).toBeTruthy()
  })
})
