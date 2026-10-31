import { bookingPreparation, currentApprovedVenueBookings, venuePreparationErrors } from './venuePreparation.js'

// A legacy event-wide value is unambiguous only with one current approved booking.
export function venuePreparationMigrationDecision(event, bookings) {
  if (!event?.venuePreparation || typeof event.venuePreparation !== 'object' || Array.isArray(event.venuePreparation)) return { kind: 'none' }
  const current = currentApprovedVenueBookings(bookings)
  if (current.length !== 1) {
    return { kind: 'manual', currentBookingIds: current.map((booking) => booking.id) }
  }
  if (current[0].preparation != null) return { kind: 'already_set', bookingId: current[0].id }
  const preparation = bookingPreparation({ preparation: event.venuePreparation })
  if (Object.keys(venuePreparationErrors(preparation)).length) return { kind: 'invalid', bookingId: current[0].id }
  return { kind: 'copy', bookingId: current[0].id, preparation }
}
