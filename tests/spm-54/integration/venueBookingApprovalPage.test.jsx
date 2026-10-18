import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { staff, coordinator, input } from '../fixtures.js'

vi.mock('../../../frontend/src/services/api.js', async (original) => ({ ...await original(),
  getVenueBookings: vi.fn(), approveVenueBooking: vi.fn(), listVenues: vi.fn(), submitVenueBooking: vi.fn() }))
const api = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.resetAllMocks() })
const booking = { ...input, id: 'one', eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall',
  suitability: { problems: [], warnings: [] }, status: 'pending', assignedVenueStaffName: 'Venue One', holdExpiresAt: '2027-03-01T00:00:00Z', canReject: true, canApprove: true }
const approved = { ...booking, status: 'approved', approvedAt: '2026-10-18T00:00:00Z', canApprove: false, canReject: false }
function show(actor = staff, route = '/requests/event/venue-bookings?bookingId=one') {
  render(<AuthContext.Provider value={{ user: actor, roles: actor.roles, loading: false }}>
    <MemoryRouter initialEntries={[route]}><App /></MemoryRouter>
  </AuthContext.Provider>)
}

describe('SPM-54 booking page with mocked API', () => {
  it('confirms venue and period, disables controls during save and shows persisted approval', async () => {
    api.getVenueBookings.mockResolvedValue({ canSubmit: false, bookings: [booking] })
    let finish
    api.approveVenueBooking.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    expect((await screen.findByRole('form', { name: 'Approve venue booking' })).textContent).toContain('Confirm the booking for Hall from')
    expect(screen.queryByRole('button', { name: 'Reject booking' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm approval' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel', exact: true }))
    expect(api.approveVenueBooking).not.toHaveBeenCalled()
    cleanup()
    api.getVenueBookings.mockResolvedValue({ canSubmit: true, bookings: [approved] })
    show(coordinator)
    await screen.findByText('Approved — venue confirmed')
    expect(screen.queryByRole('button', { name: 'Approve booking' })).toBeNull()
  })
  it('reloads a stale decision and shows the newly persisted status', async () => {
    api.getVenueBookings.mockResolvedValueOnce({ canSubmit: false, bookings: [booking] })
      .mockResolvedValueOnce({ canSubmit: false, bookings: [booking] })
      .mockResolvedValue({ canSubmit: false, bookings: [approved] })
    api.approveVenueBooking.mockRejectedValue({ status: 409, details: { message: 'Booking already decided. Reload.' } })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm approval' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm approval' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Confirm approval' }).closest('fieldset').disabled).toBe(false)
    expect(screen.queryByText('Approved — venue confirmed')).toBeNull()
  })
})


describe('SPM-54 preview and replacement regressions', () => {
  it('shows warnings before approval and refreshes them inside confirmation', async () => {
    const warning = (message) => ({ ...booking, suitability: { problems: [], warnings: [{ check: 'layout', message }] } })
    api.getVenueBookings.mockResolvedValueOnce({ bookings: [warning('Old layout warning')] })
      .mockResolvedValue({ bookings: [warning('Current layout warning')] })
    show()
    await screen.findByText('Old layout warning')
    fireEvent.click(screen.getByRole('button', { name: 'Approve booking' }))
    const form = await screen.findByRole('form', { name: 'Approve venue booking' })
    expect(within(form).getByText('Current layout warning')).toBeTruthy()
    expect(within(form).getByRole('button', { name: 'Confirm approval' }).disabled).toBe(false)
    expect(api.approveVenueBooking).not.toHaveBeenCalled()
  })
  it('blocks confirmation on preview problems', async () => {
    api.getVenueBookings.mockResolvedValue({ bookings: [{ ...booking, suitability: { warnings: [], problems: [{ check: 'capacity', message: 'Too many attendees' }] } }] })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    expect((await screen.findByRole('button', { name: 'Confirm approval' })).disabled).toBe(true)
    expect(api.approveVenueBooking).not.toHaveBeenCalled()
  })
  it('prevents confirmation during a refresh and supports retry after failure', async () => {
    let fail
    api.getVenueBookings.mockResolvedValueOnce({ bookings: [booking] })
      .mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject }))
      .mockResolvedValue({ bookings: [booking] })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    await screen.findByText('Refreshing booking details…')
    expect(screen.queryByRole('button', { name: 'Confirm approval' })).toBeNull()
    fail(new Error('offline'))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry refresh' }))
    await screen.findByRole('button', { name: 'Confirm approval' })
  })
  it('removes controls when refresh discovers an existing decision', async () => {
    api.getVenueBookings.mockResolvedValueOnce({ bookings: [booking] }).mockResolvedValue({ bookings: [approved] })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve booking' }))
    await screen.findByText('Approved — venue confirmed')
    expect(screen.queryByRole('button', { name: 'Confirm approval' })).toBeNull()
  })
  it.each(['rejected', 'pending'])('refreshes a %s replacement and retains reviewed edits after failure', async (status) => {
    const old = { ...booking, status, requirements: 'Breakkout Room', specialRequests: 'Wheelchair', canApprove: false }
    const response = (layoutPreference) => ({ canSubmit: true, event: { core: { preferredDateTime: input.startsAt, durationHours: 2 }, venue: { layoutPreference } }, bookings: [old] })
    api.listVenues.mockResolvedValue({ venues: [{ id: input.venueId, name: 'Hall', maximumCapacity: 200 }] })
    api.getVenueBookings.mockResolvedValueOnce(response('Breakkout Room')).mockResolvedValue(response('Breakout Room'))
    api.submitVenueBooking.mockRejectedValue(new Error('offline'))
    show(coordinator, '/requests/event/venue-bookings')
    fireEvent.click(await screen.findByRole('tab', { name: 'Requests' }))
    fireEvent.click(screen.getByText('Hall', { selector: 'summary span' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace request for Hall' }))
    await waitFor(() => expect(screen.getByLabelText('Venue requirements').value).toBe('Breakout Room'))
    expect(screen.getByLabelText('Special requests').value).toBe('Wheelchair')
    fireEvent.change(screen.getByLabelText('Venue requirements'), { target: { value: 'Breakout Room, extra chairs' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Venue booking request' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Venue requirements').value).toBe('Breakout Room, extra chairs')
    expect(api.submitVenueBooking.mock.calls[0][2]).toMatchObject({ requirements: 'Breakout Room, extra chairs', specialRequests: 'Wheelchair', replacesId: 'one' })
  })
})

 it('blocks replacement submission after refresh failure and retries with current defaults', async () => {
   const old = { ...booking, status: 'rejected', requirements: 'Breakkout Room' }
   const response = { canSubmit: true, event: { core: { preferredDateTime: input.startsAt, durationHours: 2 }, venue: { layoutPreference: 'Breakout Room' } }, bookings: [old] }
   api.listVenues.mockResolvedValue({ venues: [] })
   api.getVenueBookings.mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response)
   show(coordinator, '/requests/event/venue-bookings')
   fireEvent.click(await screen.findByRole('tab', { name: 'Requests' }))
   fireEvent.click(screen.getByText('Hall', { selector: 'summary span' }))
   fireEvent.click(await screen.findByRole('button', { name: 'Replace request for Hall' }))
   await screen.findByRole('button', { name: 'Retry refresh' })
   fireEvent.click(screen.getByRole('tab', { name: 'Submit a Request' }))
   expect(screen.getByRole('button', { name: 'Submit booking request' }).closest('fieldset').disabled).toBe(true)
   expect(api.submitVenueBooking).not.toHaveBeenCalled()
   fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
   await screen.findByRole('button', { name: 'Submit replacement' })
   expect(screen.getByLabelText('Venue requirements').value).toBe('Breakout Room')
 })
