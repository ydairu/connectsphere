// SPM-89 — preparation belongs to the approved booking, not to the event-wide legacy section.
import { PREPARATION_READY, VENUE_PREPARATION, preparationPatchErrors, preparationSection } from './preparation.js'
import { PREPARATION } from './status.js'
import { VENUE_STAFF, rolesOf } from './permissions.js'
import { BOOKING_APPROVED, awaitingReapproval, currentVenueBookingGroups } from './venueBooking.js'

export function bookingPreparation(booking) {
  return preparationSection({ [VENUE_PREPARATION]: booking?.preparation }, VENUE_PREPARATION)
}

export function venuePreparationErrors(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) {
    return { preparation: 'Provide a status or notes field.' }
  }
  return preparationPatchErrors({ [VENUE_PREPARATION]: patch })
}

export function currentApprovedVenueBookings(bookings) {
  return currentVenueBookingGroups(bookings).map((group) => group.current)
    .filter((booking) => booking.status === BOOKING_APPROVED && !awaitingReapproval(booking))
}

export function canUpdateBookingPreparation(user, event, booking, bookings) {
  return rolesOf(user).includes(VENUE_STAFF) && booking?.assignedVenueStaffUid === user?.uid &&
    booking?.eventRequestId === event?.id && event?.status === PREPARATION &&
    currentApprovedVenueBookings(bookings).some((current) => current.id === booking.id)
}

export function eventPreparationReadiness(event, bookings) {
  const venues = currentApprovedVenueBookings(bookings)
  const equipmentReady = event?.equipmentPreparation?.status === PREPARATION_READY
  return {
    ready: venues.length > 0 && equipmentReady &&
      venues.every((booking) => bookingPreparation(booking).status === PREPARATION_READY),
    equipmentReady,
    venues: venues.map((booking) => ({ bookingId: booking.id, venueName: booking.venueName,
      status: bookingPreparation(booking).status })),
  }
}
