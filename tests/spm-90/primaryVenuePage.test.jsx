import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VenueBookingOverview from '../../frontend/src/components/VenueBookingOverview.jsx'
import RequestDetailPage from '../../frontend/src/pages/RequestDetailPage.jsx'
import { AuthContext } from '../../frontend/src/context/auth-context.js'

vi.mock('../../frontend/src/services/api.js', async (original) => ({
  ...await original(), getVenueBookings: vi.fn(), setPrimaryVenue: vi.fn(), getRequest: vi.fn(),
}))
const api = await import('../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })

const bookings = [
  { id: 'hall-booking', venueNeedId: 'hall-need', venueName: 'Main hall', status: 'approved', createdAt: '2026-10-01',
    startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z' },
  { id: 'room-booking', venueNeedId: 'room-need', venueName: 'Breakout room', status: 'approved', createdAt: '2026-10-02',
    startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z' },
]

describe('SPM-90 primary venue page', () => {
  it('lets the Coordinator choose a booking and labels the selected one for the Organiser', async () => {
    api.getVenueBookings.mockResolvedValue({ bookings })
    api.setPrimaryVenue.mockResolvedValue({ primaryVenue: { bookingId: 'room-booking', venueName: 'Breakout room' } })
    const onPrimaryChanged = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<MemoryRouter><VenueBookingOverview user={{ uid: 'c' }} eventId="event"
      eventStatus="planning" canManage canSetPrimary onPrimaryChanged={onPrimaryChanged} /></MemoryRouter>)
    const hall = await screen.findByRole('region', { name: /^Booking for Main hall,/ })
    await user.click(within(hall).getByRole('button', { name: 'Set as primary venue' }))
    expect(api.setPrimaryVenue).toHaveBeenCalledWith({ uid: 'c' }, 'event', 'hall-booking', null)
    await waitFor(() => expect(onPrimaryChanged).toHaveBeenCalledOnce())
    rerender(<MemoryRouter><VenueBookingOverview user={{ uid: 'c' }} eventId="event" eventStatus="confirmed"
      primaryVenue={{ bookingId: 'room-booking' }} canManage={false} /></MemoryRouter>)
    const room = await screen.findByRole('region', { name: /^Booking for Breakout room,/ })
    expect(within(room).getByText('Primary venue')).toBeTruthy()
    expect(screen.getAllByRole('region')).toHaveLength(2)
  })

  it('shows only the primary location on an Attendee event detail page', async () => {
    api.getRequest.mockResolvedValue({
      request: { id: 'event', status: 'confirmed', core: { title: 'Conference' },
        primaryVenue: { venueName: 'Main hall', location: 'Building A, Level 1', startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z' } },
      editableSections: [], availableActions: [],
    })
    const user = userEvent.setup()
    render(<AuthContext.Provider value={{ user: { uid: 'attendee' }, userProfile: {}, roles: ['attendee'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/event']}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>
    </AuthContext.Provider>)
    expect(await screen.findByText('Main hall')).toBeTruthy()
    expect(screen.getByText('Building A, Level 1')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Venue Details' }))
    expect(screen.getByText('Main hall')).toBeTruthy()
    expect(screen.queryByText('Breakout room')).toBeNull()
    expect(api.getVenueBookings).not.toHaveBeenCalled()
  })
})
