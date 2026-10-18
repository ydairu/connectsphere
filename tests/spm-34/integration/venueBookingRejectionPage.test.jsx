import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { staff, coordinator, input } from '../../spm-14/fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), rejectVenueBooking: vi.fn(), listVenues: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })
const booking = { ...input, id: 'one', eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall',
  status: 'pending', assignedVenueStaffName: 'Venue One', holdExpiresAt: '2027-03-01T00:00:00Z', canReject: true }
function show(actor = staff) {
  render(<AuthContext.Provider value={{ user: actor, roles: actor.roles, loading: false }}>
    <MemoryRouter initialEntries={['/requests/event/venue-bookings?bookingId=one']}><App /></MemoryRouter>
  </AuthContext.Provider>)
}

describe('SPM-34 booking page', () => {
  it('requires a reason and displays the persisted rejection and suggestion', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    api.rejectVenueBooking.mockResolvedValue({ booking: { status: 'rejected', rejectionReason: 'No access', suggestedAlternative: 'Use the other room' } })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject booking' }))
    expect(screen.getByLabelText('Rejection reason').required).toBe(true)
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'No access' } })
    fireEvent.change(screen.getByLabelText('Suggested alternative (optional)'), { target: { value: 'Use the other room' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() => expect(api.rejectVenueBooking).toHaveBeenCalledWith(staff, 'event', 'one', 'No access', 'Use the other room'))
    expect(await screen.findByText('Use the other room')).toBeTruthy()
    expect(screen.getByText('No access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reject booking' })).toBeNull()
  })
  it('retains the form after an API failure and has no action for the Coordinator', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    api.rejectVenueBooking.mockRejectedValue(new Error('offline'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject booking' }))
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'No access' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText('Rejection reason').value).toBe('No access')
    cleanup()
    api.getVenueBookings.mockResolvedValue({ canSubmit: true, bookings: [{ ...booking, canReject: false }] })
    show(coordinator)
    await screen.findByText('Hall', { selector: 'summary span' })
    expect(screen.queryByRole('button', { name: 'Reject booking' })).toBeNull()
  })
})
