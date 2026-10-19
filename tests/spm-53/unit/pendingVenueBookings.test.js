import { describe, expect, it } from 'vitest'
import { BOOKING_PENDING, pendingVenueBookings } from '../../../shared/venueBooking.js'

const pending = (id, createdAt = '2026-10-16T00:00:00Z') => ({ id, createdAt, status: BOOKING_PENDING })
describe('SPM-53 pending queue selection', () => {
  it('excludes expired holds without mutating input', () => {
    const bookings = [pending('expired'), ...['approved', 'rejected', 'replaced', 'cancelled'].map((status) => ({ ...pending(status), status }))]
    bookings[0].holdExpiresAt = '2020-01-01T00:00:00Z'
    const before = structuredClone(bookings)
    expect(pendingVenueBookings(bookings).map((b) => b.id)).toEqual([])
    expect(bookings).toEqual(before)
  })
  it('orders oldest first with stable ID ties without sorting the input', () => {
    const bookings = [pending('z'), pending('b', '2026-10-15T00:00:00Z'), pending('a')]
    expect(pendingVenueBookings(bookings).map((b) => b.id)).toEqual(['b', 'a', 'z'])
    expect(bookings.map((b) => b.id)).toEqual(['z', 'b', 'a'])
  })
  it('accepts an empty queue', () => expect(pendingVenueBookings([])).toEqual([]))
})
