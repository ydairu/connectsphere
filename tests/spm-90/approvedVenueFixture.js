export function approvedVenueFixture(eventId, bookingId = 'approved-venue') {
  const startsAt = '2027-03-01T10:00:00Z'
  const endsAt = '2027-03-01T12:00:00Z'
  const holdId = `hold-${bookingId}`
  const booking = { eventRequestId: eventId, venueNeedId: bookingId, venueId: 'hall', venueName: 'Hall',
    status: 'approved', holdId, startsAt, endsAt, createdAt: '2026-10-01T00:00:00Z' }
  const hold = { eventRequestId: eventId, bookingRequestId: bookingId, venueId: 'hall',
    status: 'confirmed_booking', lifecycleStatus: 'active', startsAt, endsAt }
  return { booking, holdId, hold }
}

export function addApprovedVenue(db, eventId, bookingId = 'approved-venue') {
  const { booking, holdId, hold } = approvedVenueFixture(eventId, bookingId)
  db.collectionData('venueBookingRequests').set(bookingId, booking)
  db.collectionData('venueAvailability').set(holdId, hold)
}
