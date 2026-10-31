// SPM-40 — what the assigned Coordinator needs to assess an Organiser's change request: the arrangements it may
// affect, and how each booked venue suits the event as proposed. Read-only; nothing is released or reset.
// The rules are in shared/changeRequests.js and shared/venueSuitability.js.

import { NOT_PERMITTED, affectedArrangements, currentChangeRequest, eventWithChanges, findingsForChange } from '../../../shared/changeRequests.js'
import { isAssignedCoordinator } from '../../../shared/requestActors.js'
import { checkVenueSuitability } from '../../../shared/venueSuitability.js'
import { BOOKING_APPROVED, currentVenueBookingGroups, effectiveVenueBookingStatus } from '../../../shared/venueBooking.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { EventRequestNotFoundError } from './eventRequestService.js'
import { StatusTransitionError, requireRequestScope } from './statusTransitionService.js'
import { loadEventVenueBookings } from './venueBookingService.js'

/**
 * { affected: [{ key, kind, label }], venues: [{ bookingId, venueName, result, problems, warnings }] } for the
 * current request. A venue's own reservation for this event is not counted as a clash with the proposed time.
 */
export async function assessChangeRequest(id, user, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const event = { id, ...snapshot.data() }
  requireRequestScope(user, event)
  if (!isAssignedCoordinator(user, event)) throw new StatusTransitionError(NOT_PERMITTED)

  const request = currentChangeRequest(event)
  if (!request) return { affected: [], venues: [] }
  const bookings = await loadEventVenueBookings(id, db)
  const proposed = eventWithChanges(event, request)
  const approved = currentVenueBookingGroups(bookings)
    .map((group) => group.current)
    .filter((booking) => effectiveVenueBookingStatus(booking, now) === BOOKING_APPROVED)

  const venues = await Promise.all(approved.map(async (booking) => {
    const venue = await db.collection('venues').doc(booking.venueId).get()
    if (!venue.exists) {
      return { bookingId: booking.id, venueName: booking.venueName ?? null, result: null, problems: [{ check: 'venue', message: 'This venue is no longer in the venue catalogue.' }], warnings: [] }
    }
    const commitments = (await db.collection('venueAvailability').where('venueId', '==', booking.venueId).get()).docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((commitment) => commitment.eventRequestId !== id)
    const { result, problems, warnings } = checkVenueSuitability(proposed, venue.data(), commitments, now)
    return { bookingId: booking.id, venueName: booking.venueName ?? venue.data().name ?? null, result,
      problems: findingsForChange(request, problems), warnings: findingsForChange(request, warnings) }
  }))
  return { affected: affectedArrangements(event, request, bookings, now).map(({ key, kind, label }) => ({ key, kind, label })), venues }
}
