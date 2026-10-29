import { BOOKING_APPROVED, currentVenueBookingGroups } from './venueBooking.js'

export const PRIMARY_VENUE_FIELD = 'primaryVenue'

export function primaryVenueFromBooking(booking, venueLocation = null) {
  return {
    bookingId: booking.id,
    venueId: booking.venueId,
    venueName: booking.venueName,
    location: typeof venueLocation === 'string' && venueLocation.trim() ? venueLocation.trim() : null,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  }
}

export function publicPrimaryVenue(primaryVenue, includeBookingId = false) {
  if (!primaryVenue || typeof primaryVenue !== 'object') return null
  const { bookingId, venueName, location, startsAt, endsAt } = primaryVenue
  return {
    ...(includeBookingId ? { bookingId } : {}),
    venueName, location: location ?? null,
    startsAt,
    endsAt,
  }
}

export function primaryVenueReadiness(event, bookings) {
  const groups = currentVenueBookingGroups(bookings)
  const approved = groups.map(({ current }) => current).filter((booking) => booking.status === BOOKING_APPROVED)
  const selected = approved.find((booking) => booking.id === event.primaryVenue?.bookingId)
  const automatic = !event.primaryVenue && event.primaryVenueSelectionRequired !== true &&
    groups.length === 1 && approved.length === 1 ? approved[0] : null
  return { ready: Boolean(selected || automatic), selectedBooking: selected ?? null, automaticBooking: automatic }
}
