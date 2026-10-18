import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { staff, coordinator, input } from '../fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), approveVenueBooking: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })
const booking = { ...input, id: 'one', eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall',
  status: 'pending', assignedVenueStaffName: 'Venue One', holdExpiresAt: '2027-03-01T00:00:00Z', canReject: true, canApprove: true }
const approved = { ...booking, status: 'approved', approvedAt: '2026-10-18T00:00:00Z', canApprove: false, canReject: false }
function show(actor = staff) {
  render(<AuthContext.Provider value={{ user: actor, roles: actor.roles, loading: false }}>
    <MemoryRouter initialEntries={['/requests/event/venue-bookings?bookingId=one']}><App /></MemoryRouter>
  </AuthContext.Provider>)
}

describe('SPM-54 booking page with mocked API', () => {
  it('confirms venue and period, disables controls during save and shows persisted approval', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    let finish
    api.approveVenueBooking.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    expect(screen.getByRole('form', { name: 'Approve venue booking' }).textContent).toContain('Confirm the booking for Hall from')
    expect(screen.queryByRole('button', { name: 'Reject booking' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect(screen.getByRole('button', { name: 'Approving…' }).closest('fieldset').disabled).toBe(true)
    expect(api.approveVenueBooking).toHaveBeenCalledWith(staff, 'event', 'one')
    finish({ booking: approved })
    expect(await screen.findByText('Approved — venue confirmed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Coordinator has been notified')
    expect(screen.queryByText('Hold expiry')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve booking' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject booking' })).toBeNull()
  })
  it('cancels confirmation without calling the API and has no control for the Coordinator', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    expect(api.approveVenueBooking).not.toHaveBeenCalled()
    cleanup()
    api.getVenueBookings.mockResolvedValue({ canSubmit: true, bookings: [approved] })
    show(coordinator)
    await screen.findByText('Approved — venue confirmed')
    expect(screen.queryByRole('button', { name: 'Approve booking' })).toBeNull()
  })
  it('reloads a stale decision and shows the newly persisted status', async () => {
    api.getVenueBookings.mockResolvedValueOnce({ canSubmit: false, bookings: [booking] })
      .mockResolvedValue({ canSubmit: false, bookings: [approved] })
    api.approveVenueBooking.mockRejectedValue({ status: 409, details: { message: 'Booking already decided. Reload.' } })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Booking already decided')
    fireEvent.click(screen.getByRole('button', { name: 'Reload booking' }))
    await screen.findByText('Approved — venue confirmed')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reload booking' })).toBeNull())
  })
  it('keeps confirmation available for retry after a network failure', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    api.approveVenueBooking.mockRejectedValue(new Error('offline'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Confirm approval' }).closest('fieldset').disabled).toBe(false)
    expect(screen.queryByText('Approved — venue confirmed')).toBeNull()
  })
})
