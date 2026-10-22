// SPM-13 — checks the catalogue venues against one event for its assigned Coordinator.
//
// The rules are in shared/venueSuitability.js; this reads the event, the venues and their availability.
// The event and the venues may live in different databases in tests, so each is passed in.

import { getAdminDb } from '../config/firebaseAdmin.js'
import { buildVenueFilterOptions } from '../../../shared/venueSearch.js'
import {
  NOT_PERMITTED,
  UNSUITABLE,
  checkVenueSuitability,
  compareSuitability,
  eventPeriod,
  suitabilityRefusal,
  venueRequirements,
} from '../../../shared/venueSuitability.js'
import { formatSingaporePeriod } from '../../../shared/operatingHours.js'
import {
  BOOKING_APPROVED,
  BOOKING_PENDING,
  currentVenueBookingGroups,
  effectiveVenueBookingStatus,
} from '../../../shared/venueBooking.js'
import { EventRequestForbiddenError, EventRequestNotFoundError } from './eventRequestService.js'
import { requireRequestScope } from './statusTransitionService.js'
import { VenueNotFoundError } from './venueService.js'

export class VenueSuitabilityUnavailableError extends Error {
  constructor() {
    super('Venue suitability is checked while the event is Under Review or in Planning.')
    this.name = 'VenueSuitabilityUnavailableError'
  }
}

function eventSummary(request) {
  const period = eventPeriod(request)
  return {
    period: period && { ...period, label: formatSingaporePeriod(period.startsAt, period.endsAt) },
    expectedAttendees: request.core?.expectedAttendees ?? null,
    layoutPreference: request.venue?.layoutPreference ?? null,
    accessibilityRequired: request.venue?.accessibilityRequired === true,
    accessibilityNeeds: request.venue?.accessibilityNeeds ?? null,
    ...venueRequirements(request),
  }
}

const VENUE_BOOKINGS = 'venueBookingRequests'

// SPM-76: the event's own venues are the current request of each venue need that is still pending or
// approved; rejected, cancelled, expired and replaced requests no longer name a venue for the event.
function eventVenueBookings(bookings, now) {
  return currentVenueBookingGroups(bookings)
    .map(({ venueNeedId, current }) => ({ venueNeedId, booking: current, status: effectiveVenueBookingStatus(current, now) }))
    .filter(({ status }) => status === BOOKING_PENDING || status === BOOKING_APPROVED)
}

/**
 * GET /api/event-requests/:id/venue-suitability. Returns { event, eventVenues, venues, options }:
 * - eventVenues: each venue the event has asked for (SPM-76), in the order requested, each checked
 *   separately with { result, problems, warnings } and its request status;
 * - venues: every catalogue venue (or only `venueId`) with { result, problems, warnings }, suitable first;
 * - options: the facilities and accessibility features recorded in the catalogue, for choosing requirements.
 *
 * Refusals follow SPM-65: a Coordinator outside the event's scope gets EventRequestNotFoundError, anyone
 * else outside it EventRequestForbiddenError. In scope but not the assigned Coordinator is forbidden; the
 * wrong status is VenueSuitabilityUnavailableError. An unknown venueId is VenueNotFoundError.
 */
export async function getVenueSuitability(
  id,
  user,
  { venueId } = {},
  eventDb = getAdminDb(),
  venueDb = getAdminDb(),
  now = new Date(),
) {
  const snapshot = await eventDb.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const request = { id, ...snapshot.data() }

  requireRequestScope(user, request)
  const refusal = suitabilityRefusal(user, request)
  if (refusal === NOT_PERMITTED) throw new EventRequestForbiddenError('Only the assigned Event Coordinator can check venue suitability.')
  if (refusal) throw new VenueSuitabilityUnavailableError()

  const [venuesSnapshot, availabilitySnapshot, bookingsSnapshot] = await Promise.all([
    venueDb.collection('venues').get(),
    venueDb.collection('venueAvailability').get(),
    eventDb.collection(VENUE_BOOKINGS).where('eventRequestId', '==', id).get(),
  ])
  const catalogue = venuesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const venues = venueId === undefined ? catalogue : catalogue.filter((venue) => venue.id === venueId)
  if (venueId !== undefined && venues.length === 0) throw new VenueNotFoundError(venueId)

  const commitmentsByVenue = new Map()
  for (const doc of availabilitySnapshot.docs) {
    const commitment = { id: doc.id, ...doc.data() }
    if (!commitmentsByVenue.has(commitment.venueId)) commitmentsByVenue.set(commitment.venueId, [])
    commitmentsByVenue.get(commitment.venueId).push(commitment)
  }

  const summarise = (venue) => ({
    id: venue.id,
    name: venue.name,
    location: venue.location ?? null,
    maximumCapacity: venue.maximumCapacity ?? null,
    ...checkVenueSuitability(request, venue, commitmentsByVenue.get(venue.id) ?? [], now),
  })
  const catalogueById = new Map(catalogue.map((venue) => [venue.id, venue]))
  const bookings = bookingsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const eventVenues = eventVenueBookings(bookings, now).map(({ venueNeedId, booking, status }) => {
    const venue = catalogueById.get(booking.venueId)
    const checked = venue
      ? summarise(venue)
      : {
          id: booking.venueId ?? null,
          name: booking.venueName ?? 'Unknown venue',
          location: null,
          maximumCapacity: null,
          result: UNSUITABLE,
          problems: [{ check: 'venue', message: 'This venue is no longer in the venue catalogue.' }],
          warnings: [],
        }
    return { venueNeedId, bookingId: booking.id, bookingStatus: status, ...checked }
  })

  const options = buildVenueFilterOptions(catalogue)
  return {
    event: eventSummary(request),
    eventVenues,
    venues: venues.map(summarise).sort(compareSuitability),
    options: { facilities: options.facilities, accessibilityFeatures: options.accessibilityFeatures },
  }
}
