import { COORDINATOR, isAssignedCoordinator, rolesOf } from '../../../shared/permissions.js'
import { primaryVenueFromBooking, primaryVenueReadiness } from '../../../shared/primaryVenue.js'
import { BOOKING_APPROVED, currentVenueBookingGroups, venueBookingReadiness } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES } from '../../../shared/venueAvailability.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { BOOKINGS } from './venueBookingService.js'
import { recordPrimaryVenueChange } from './primaryVenueHistory.js'

export class PrimaryVenueError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

export async function validConfirmedBookingHold(booking, eventId, db, tx = null) {
  if (!booking?.holdId || booking.status !== BOOKING_APPROVED ||
    typeof booking.venueId !== 'string' || !booking.venueId ||
    typeof booking.venueName !== 'string' || !booking.venueName.trim() ||
    !Number.isFinite(Date.parse(booking.startsAt)) ||
    !Number.isFinite(Date.parse(booking.endsAt)) || Date.parse(booking.endsAt) <= Date.parse(booking.startsAt)) return false
  const ref = db.collection('venueAvailability').doc(booking.holdId)
  const snapshot = tx ? await tx.get(ref) : await ref.get()
  const hold = snapshot.data()
  return Boolean(hold && hold.status === AVAILABILITY_STATUS.CONFIRMED_BOOKING &&
    !REMOVED_STATUSES.has(hold.lifecycleStatus) && hold.eventRequestId === eventId &&
    hold.bookingRequestId === booking.id && hold.venueId === booking.venueId &&
    hold.startsAt === booking.startsAt && hold.endsAt === booking.endsAt)
}

export async function loadVenueBookingState(eventId, event, db = getAdminDb(), now = new Date(), tx = null) {
  const query = db.collection(BOOKINGS).where('eventRequestId', '==', eventId)
  const bookings = rows(tx ? await tx.get(query) : await query.get())
  const selection = primaryVenueReadiness(event, bookings)
  const candidate = selection.selectedBooking ?? selection.automaticBooking
  const holdValid = candidate ? await validConfirmedBookingHold(candidate, eventId, db, tx) : false
  const venue = holdValid && selection.automaticBooking
    ? (tx ? await tx.get(db.collection('venues').doc(candidate.venueId)) : await db.collection('venues').doc(candidate.venueId).get()).data()
    : null
  const selectionMatches = !selection.selectedBooking ||
    ['venueId', 'venueName', 'startsAt', 'endsAt'].every((key) => event.primaryVenue?.[key] === candidate[key])
  return {
    venueBookingReadiness: venueBookingReadiness(bookings, now),
    primaryVenueReadiness: { ready: selection.ready && holdValid && selectionMatches,
      automaticBooking: selection.automaticBooking && holdValid ? { ...selection.automaticBooking, venueLocation: venue?.location ?? null } : null },
  }
}

export async function setPrimaryVenue(eventId, input, user, db = getAdminDb(), now = new Date()) {
  if (!rolesOf(user).includes(COORDINATOR)) throw new PrimaryVenueError(403, 'Only the assigned Coordinator can set the primary venue.')
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some((key) => !['bookingId', 'expectedPrimaryVenueBookingId'].includes(key)) ||
    typeof input.bookingId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.bookingId) ||
    !Object.hasOwn(input, 'expectedPrimaryVenueBookingId') ||
    (input.expectedPrimaryVenueBookingId !== null && typeof input.expectedPrimaryVenueBookingId !== 'string')) {
    throw new PrimaryVenueError(400, 'Provide a bookingId and the expected current primary booking ID (or null).')
  }
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const eventSnapshot = await tx.get(eventRef)
    if (!eventSnapshot.exists) throw new PrimaryVenueError(404, 'Event not found.')
    const event = eventSnapshot.data()
    if (!isAssignedCoordinator(user, event)) throw new PrimaryVenueError(404, 'Event not found.')
    if (![PLANNING, CONFIRMED].includes(event.status)) throw new PrimaryVenueError(409, 'The primary venue can be changed only in Planning or Confirmed.')
    if ((event.primaryVenue?.bookingId ?? null) !== input.expectedPrimaryVenueBookingId) {
      throw new PrimaryVenueError(409, 'The primary venue changed. Reload the event and try again.')
    }
    const bookings = rows(await tx.get(db.collection(BOOKINGS).where('eventRequestId', '==', eventId)))
    const booking = currentVenueBookingGroups(bookings).map((group) => group.current)
      .find((current) => current.id === input.bookingId)
    if (!booking || booking.status !== BOOKING_APPROVED ||
      !(await validConfirmedBookingHold(booking, eventId, db, tx))) {
      throw new PrimaryVenueError(409, 'Choose a current approved venue booking with an active confirmed reservation.')
    }
    const venue = (await tx.get(db.collection('venues').doc(booking.venueId))).data()
    const primaryVenue = primaryVenueFromBooking(booking, venue?.location)
    if (event.primaryVenue?.bookingId === primaryVenue.bookingId && event.primaryVenueSelectionRequired !== true) return primaryVenue
    const at = now.toISOString()
    tx.update(eventRef, { primaryVenue, primaryVenueSelectionRequired: false, updatedAt: at })
    recordPrimaryVenueChange(tx, eventRef, event.primaryVenue, primaryVenue,
      { type: 'user', uid: user.uid, name: user.name ?? null, role: COORDINATOR }, at)
    return primaryVenue
  })
}
