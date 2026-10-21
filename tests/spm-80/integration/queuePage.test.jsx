import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { staff } from '../../spm-14/fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), getVenueBookingQueue: vi.fn(), listVenues: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })

const hall = { id: 'hall-booking', eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall',
  startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z', status: 'pending' }
const room = { ...hall, id: 'room-booking', venueName: 'Room', startsAt: '2027-03-01T11:00:00Z', endsAt: '2027-03-01T12:00:00Z' }

function show() {
  render(<AuthContext.Provider value={{ user: staff, roles: staff.roles, loading: false }}>
    <MemoryRouter initialEntries={['/venues/booking-requests']}><App /></MemoryRouter>
  </AuthContext.Provider>)
}

describe('SPM-80 queue cards', () => {
  it('distinguishes requests for one event and keeps each details link tied to its booking ID after refresh', async () => {
    api.getVenueBookingQueue.mockResolvedValueOnce({ bookings: [hall, room] }).mockResolvedValue({ bookings: [room] })
    show()
    expect(await screen.findByText('Conference — Hall')).toBeTruthy()
    expect(screen.getByText('Conference — Room')).toBeTruthy()
    const cards = screen.getAllByText('Under review').map((status) => status.closest('.booking-card'))
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('Hall')).toBeTruthy()
    expect(within(cards[1]).getByText('Room')).toBeTruthy()
    expect(within(cards[0]).getByRole('link', { name: 'View details' }).getAttribute('href')).toBe('/requests/event/venue-bookings?bookingId=hall-booking')
    expect(within(cards[1]).getByRole('link', { name: 'View details' }).getAttribute('href')).toBe('/requests/event/venue-bookings?bookingId=room-booking')
    expect(within(cards[0]).getAllByText(/2027/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Conference — Room')).toBeTruthy()
    expect(screen.queryByText('Conference — Hall')).toBeNull()
    expect(screen.getByRole('link', { name: 'View details' }).getAttribute('href')).toContain('bookingId=room-booking')
  })
})
