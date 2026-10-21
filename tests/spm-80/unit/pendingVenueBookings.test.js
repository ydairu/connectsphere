import { describe, expect, it } from 'vitest'
import { BOOKING_PENDING, pendingVenueBookings } from '../../../shared/venueBooking.js'

describe('SPM-80 per-request queue selection', () => {
  it('keeps every pending venue request for one event while excluding decided and expired siblings', () => {
    const base = { eventRequestId: 'event', eventTitle: 'Conference', createdAt: '2026-10-16T00:00:00Z' }
    const bookings = [
      { ...base, id: 'room', venueName: 'Room', status: BOOKING_PENDING },
      { ...base, id: 'approved', venueName: 'Old hall', status: 'approved' },
      { ...base, id: 'hall', venueName: 'Hall', status: BOOKING_PENDING },
      { ...base, id: 'rejected', venueName: 'Old room', status: 'rejected' },
      { ...base, id: 'replaced', venueName: 'Former hall', status: 'replaced' },
      { ...base, id: 'expired', venueName: 'Expired room', status: BOOKING_PENDING, holdExpiresAt: '2026-10-15T00:00:00Z' },
    ]
    const before = structuredClone(bookings)
    expect(pendingVenueBookings(bookings, new Date('2026-10-16T12:00:00Z')).map(({ id, venueName }) => ({ id, venueName })))
      .toEqual([{ id: 'hall', venueName: 'Hall' }, { id: 'room', venueName: 'Room' }])
    expect(bookings).toEqual(before)
  })
})
