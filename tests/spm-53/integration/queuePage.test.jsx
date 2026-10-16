import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { staff, coordinator, input } from '../../spm-14/fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), getVenueBookingQueue: vi.fn(), listVenues: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })
const booking = { ...input, id: 'one', eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall', expectedAttendees: 100,
  status: 'pending', assignedVenueStaffName: 'Venue One', holdExpiresAt: '2020-01-01T00:00:00Z', capacityWarning: 'Capacity warning' }
function show(path = '/venues/booking-requests', actor = staff) {
  render(<AuthContext.Provider value={{ user: actor, roles: actor.roles, loading: false }}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthContext.Provider>)
}
describe('SPM-53 pages with mocked API', () => {
  it('shows concise cards, opens only the selected booking and returns to a refreshed queue', async () => {
    api.getVenueBookingQueue.mockResolvedValue({ bookings: [booking] })
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking, { ...booking, id: 'two', venueName: 'Other room', requirements: 'Other requirements' }] })
    show()
    expect(await screen.findByText('Conference')).toBeTruthy()
    expect(screen.queryByText(input.requirements)).toBeNull()
    expect(screen.queryByText(input.specialRequests)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'View details' }))
    expect(await screen.findByText(input.requirements)).toBeTruthy()
    expect(screen.getByText(input.specialRequests)).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('Venue One')).toBeTruthy()
    expect(screen.getByText(/\(expired\)/)).toBeTruthy()
    expect(screen.getByRole('note').textContent).toBe('Capacity warning')
    expect(screen.queryByText('Other requirements')).toBeNull()
    api.getVenueBookingQueue.mockResolvedValue({ bookings: [] })
    fireEvent.click(screen.getByRole('link', { name: 'Back to pending bookings' }))
    expect(await screen.findByText('No pending booking requests.')).toBeTruthy()
    expect(api.getVenueBookingQueue).toHaveBeenCalledTimes(2)
  })
  it('handles loading, failure, retry and refresh without showing a false empty state', async () => {
    let reject
    api.getVenueBookingQueue.mockReturnValueOnce(new Promise((resolve, fail) => { reject = fail }))
    show()
    expect(screen.getByRole('status').textContent).toContain('Loading')
    expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(true)
    await waitFor(() => expect(reject).toBeTypeOf('function'))
    reject(new Error('offline'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('No pending booking requests.')).toBeNull()
    api.getVenueBookingQueue.mockResolvedValue({ bookings: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('No pending booking requests.')
    api.getVenueBookingQueue.mockResolvedValue({ bookings: [booking] })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('Conference')
  })
  it('preserves multiline content, supplies None and keeps selected details read-only for Coordinators too', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: true, bookings: [{ ...booking, requirements: 'Line one\nLine two', specialRequests: '' }] })
    show('/requests/event/venue-bookings?bookingId=one', coordinator)
    expect((await screen.findByText('Line one Line two')).textContent).toBe('Line one\nLine two')
    expect(screen.getByText('None')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Replace request/ })).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
    expect(api.listVenues).not.toHaveBeenCalled()
  })
  it.each(['missing', ''])('never substitutes another booking for unavailable ID %s', async (id) => {
    api.getVenueBookings.mockResolvedValue({ bookings: [booking] })
    show(`/requests/event/venue-bookings?bookingId=${id}`)
    await screen.findByText(/This booking request is unavailable/)
    expect(screen.queryByText(input.requirements)).toBeNull()
  })
})
