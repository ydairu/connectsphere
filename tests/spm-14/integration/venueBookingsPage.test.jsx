import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { coordinator, staff, input } from '../fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), getVenueBookingQueue: vi.fn(), listVenues: vi.fn(), submitVenueBooking: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })
const booking = { ...input, id: 'booking', venueName: 'Hall', eventTitle: 'Conference', expectedAttendees: 100,
  status: 'pending', assignedVenueStaffName: 'Venue One', holdExpiresAt: '2027-02-01T00:00:00Z' }
function show(actor = coordinator, queue = false) {
  render(<AuthContext.Provider value={{ user: actor, roles: actor.roles, loading: false }}><MemoryRouter initialEntries={[queue ? '/venues/booking-requests' : '/requests/event/venue-bookings']}><App /></MemoryRouter></AuthContext.Provider>)
}
function setup(bookings = []) {
  api.getVenueBookings.mockResolvedValue({ canSubmit: true, event: { core: { title: 'Conference', expectedAttendees: 100, preferredDateTime: input.startsAt, durationHours: 2 }, venue: { layoutPreference: 'Theatre' } }, bookings })
  api.listVenues.mockResolvedValue({ venues: [{ id: 'hall', name: 'Hall', maximumCapacity: 50 }] })
}
describe('SPM-14 pages with mocked API', () => {
  it('shows booking titles and approval stages before expanding their details', async () => {
    setup([booking, { ...booking, id: 'approved', venueName: 'Auditorium', status: 'approved' },
      { ...booking, id: 'replaced', venueName: 'Studio', status: 'replaced' }])
    show()
    fireEvent.click(await screen.findByRole('tab', { name: 'Requests' }))
    const summaries = screen.getAllByText(/Hall|Auditorium|Studio/, { selector: 'summary span:first-child' })
    expect(summaries.map((item) => item.closest('summary').textContent)).toEqual(['HallUnder review', 'AuditoriumApproved', 'StudioReplaced'])
    expect(summaries[0].closest('details').open).toBe(false)
    fireEvent.click(summaries[0])
    expect(summaries[0].closest('details').open).toBe(true)
    expect(summaries[0].closest('details').textContent).toContain('Quiet room')
  })

  it('prefills, warns above capacity, submits and shows the assignment', async () => {
    setup()
    api.submitVenueBooking.mockResolvedValue({ booking })
    show()
    fireEvent.change(await screen.findByLabelText('Venue'), { target: { value: 'hall' } })
    expect(screen.getByLabelText('Start').readOnly).toBe(true)
    expect(screen.getByLabelText('End').readOnly).toBe(true)
    expect(api.listVenues).toHaveBeenCalledWith(coordinator, { availableFrom: input.startsAt, availableTo: input.endsAt })
    expect(screen.getByText(/exceeds venue capacity/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit booking request' }))
    await screen.findByText(/Booking request submitted to Venue One/)
    expect(api.submitVenueBooking).toHaveBeenCalledWith(coordinator, 'event', expect.objectContaining({ venueId: 'hall', requirements: 'Theatre', submissionKey: expect.any(String) }))
  })
  it('preserves input and the retry key on failure; replacement targets the selected request', async () => {
    setup([booking])
    api.submitVenueBooking.mockRejectedValue({ details: { message: 'The venue is not available for that period' } })
    show()
    fireEvent.click(await screen.findByRole('tab', { name: 'Requests' }))
    fireEvent.click(screen.getByText('Hall', { selector: 'summary span' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace request for Hall' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit replacement' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Venue').value).toBe('hall')
    const sent = api.submitVenueBooking.mock.calls[0][2]
    expect(sent.replacesId).toBe('booking')
    fireEvent.click(await screen.findByRole('button', { name: 'Submit replacement' }))
    await waitFor(() => expect(api.submitVenueBooking).toHaveBeenCalledTimes(2))
    expect(api.submitVenueBooking.mock.calls[1][2].submissionKey).toBe(sent.submissionKey)
  })
  it('shows staff queue details without submission controls', async () => {
    api.getVenueBookingQueue.mockResolvedValue({ bookings: [{ ...booking, eventRequestId: 'event' }] })
    show(staff, true)
    expect(await screen.findByText('Conference')).toBeTruthy()
    expect(screen.queryByText('Quiet room')).toBeNull()
    expect(screen.getByRole('link', { name: 'View details' }).getAttribute('href')).toBe('/requests/event/venue-bookings?bookingId=booking')
    expect(screen.queryByRole('button', { name: 'Submit booking request' })).toBeNull()
  })
  it('shows a direct-link access refusal without a booking form', async () => {
    api.getVenueBookings.mockRejectedValue({ details: { message: 'Event not found.' } })
    show()
    expect((await screen.findByRole('alert')).textContent).toContain('Event not found.')
    expect(screen.queryByLabelText('Venue')).toBeNull()
  })
})
