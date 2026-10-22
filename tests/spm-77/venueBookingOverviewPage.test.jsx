import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VenueBookingOverview from '../../frontend/src/components/VenueBookingOverview.jsx'
import { organiser } from '../spm-14/fixtures.js'

vi.mock('../../frontend/src/services/api.js', async (original) => ({ ...await original(), getVenueBookings: vi.fn() }))
const api = await import('../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })

const bookings = [
  { id: 'old', venueNeedId: 'old', venueName: 'Hall', status: 'cancelled', createdAt: '2027-01-01',
    startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z' },
  { id: 'next', venueNeedId: 'old', replacesId: 'old', venueName: 'Studio', status: 'pending', createdAt: '2027-01-03',
    startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z' },
  { id: 'room', venueNeedId: 'room', venueName: 'Breakout room', status: 'approved', createdAt: '2027-01-02',
    startsAt: '2027-03-01T11:00:00Z', endsAt: '2027-03-01T12:00:00Z' },
]

function show(canManage = false) {
  render(<MemoryRouter><VenueBookingOverview user={organiser} eventId="event" eventStatus="planning" canManage={canManage} /></MemoryRouter>)
}

describe('SPM-77 Venue Details overview', () => {
  it('shows one current booking per need and keeps previous attempts in history', async () => {
    api.getVenueBookings.mockResolvedValue({ bookings })
    show()
    const studio = await screen.findByRole('region', { name: /^Booking for Studio,/ })
    const room = screen.getByRole('region', { name: /^Booking for Breakout room,/ })
    expect(within(studio).getByText('Under review')).toBeTruthy()
    expect(within(studio).getByText(/Await Venue Staff review/)).toBeTruthy()
    expect(within(room).getByText('Approved')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /^Booking for Hall,/ })).toBeNull()
    fireEvent.click(within(studio).getByText('Previous requests (1)'))
    expect(within(studio).getByText(/Hall · Cancelled/)).toBeTruthy()
    expect(screen.queryByText('Manage this booking')).toBeNull()
  })

  it('links a Coordinator to the selected current request and can refresh', async () => {
    api.getVenueBookings.mockResolvedValue({ bookings })
    show(true)
    const studio = await screen.findByRole('region', { name: /^Booking for Studio,/ })
    expect(within(studio).getByRole('link', { name: 'Manage this booking' }).getAttribute('href')).toBe('/requests/event/venue-bookings?bookingId=next')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByRole('region', { name: /^Booking for Breakout room,/ })
    expect(api.getVenueBookings).toHaveBeenCalledTimes(2)
  })
})
