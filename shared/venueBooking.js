import { COORDINATOR, VENUE_STAFF, isAssignedCoordinator, rolesOf } from './permissions.js'
import { PLANNING } from './status.js'
import { chooseStaff } from './staffAssignment.js'
import { validateAvailabilityRange } from './venueAvailability.js'

export const BOOKING_PENDING = 'pending'
export const BOOKING_REJECTED = 'rejected'
export const BOOKING_REPLACED = 'replaced'
export const BOOKING_CANCELLED = 'cancelled'

// Expired holds do not decide a booking request; only its booking status does.
export function pendingVenueBookings(bookings) {
  return bookings.filter((booking) => booking.status === BOOKING_PENDING)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function canRequestVenue(user, event) {
  return rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event) && event.status === PLANNING
}

export function canReadVenueBooking(user, event, booking) {
  return (rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)) ||
    (rolesOf(user).includes(VENUE_STAFF) && booking.assignedVenueStaffUid === user.uid)
}

export function normaliseVenueBooking(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: {}, errors: { request: 'A booking request object is required.' } }
  const errors = {}
  const allowed = ['venueId', 'startsAt', 'endsAt', 'requirements', 'specialRequests', 'submissionKey', 'replacesId']
  for (const key of Object.keys(input)) if (!allowed.includes(key)) errors[key] = 'This field cannot be set.'
  const range = validateAvailabilityRange({ from: input.startsAt, to: input.endsAt })
  if (range.errors.from) errors.startsAt = range.errors.from
  if (range.errors.to) errors.endsAt = range.errors.to
  const text = (key, required = false) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if ((required && !value) || (input[key] != null && typeof input[key] !== 'string')) errors[key] = 'Enter text for this field.'
    if (value.length > 4000) errors[key] = 'Use at most 4000 characters.'
    return value
  }
  const value = {
    venueId: text('venueId', true), startsAt: range.from?.toISOString() ?? null,
    endsAt: range.to?.toISOString() ?? null, requirements: text('requirements', true),
    specialRequests: text('specialRequests'), submissionKey: text('submissionKey', true), replacesId: text('replacesId') || null,
  }
  for (const key of ['venueId', 'submissionKey', 'replacesId']) {
    if (value[key] && !/^[A-Za-z0-9_-]{1,128}$/.test(value[key])) errors[key] = 'Invalid reference.'
  }
  return { value, errors }
}

export function capacityWarning(attendance, capacity) {
  return Number(attendance) > Number(capacity)
    ? `Expected attendance (${attendance}) exceeds venue capacity (${capacity}). Venue Staff must review this request.` : null
}

// Least pending work, then cycle through stable UID order after the previous assignee. The rule is
// chooseStaff (shared/staffAssignment.js), shared with SPM-17's Technical Support Staff assignment.
export function chooseVenueStaff(users, bookings, lastUid) {
  const pendingAssignees = bookings.filter((b) => b.status === BOOKING_PENDING).map((b) => b.assignedVenueStaffUid)
  return chooseStaff(users, VENUE_STAFF, pendingAssignees, lastUid)
}
