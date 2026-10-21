import { COORDINATOR, VENUE_STAFF, isAssignedCoordinator, rolesOf } from './permissions.js'
import { PLANNING } from './status.js'
import { chooseStaff } from './staffAssignment.js'
import { validateAvailabilityRange } from './venueAvailability.js'
import { checkVenueSuitability, LAYOUT } from './venueSuitability.js'

export const BOOKING_PENDING = 'pending'
export const BOOKING_APPROVED = 'approved'
export const BOOKING_REJECTED = 'rejected'
export const BOOKING_REPLACED = 'replaced'
export const BOOKING_CANCELLED = 'cancelled'
export const BOOKING_EXPIRED = 'expired'

export function effectiveVenueBookingStatus(booking, now = new Date()) {
  return booking.status === BOOKING_PENDING && typeof booking.holdExpiresAt === 'string' &&
    Number.isFinite(Date.parse(booking.holdExpiresAt)) && Date.parse(booking.holdExpiresAt) <= now.getTime()
    ? BOOKING_EXPIRED : booking.status
}

// Older bookings did not store a need ID. Follow their replacement chain to its root.
export function venueNeedId(booking, bookings) {
  if (booking.venueNeedId) return booking.venueNeedId
  const byId = new Map(bookings.map((item) => [item.id, item]))
  const seen = new Set()
  let current = booking
  while (current?.replacesId) {
    if (seen.has(current.id)) return null
    seen.add(current.id)
    current = byId.get(current.replacesId)
    if (!current) return null
  }
  return current?.id ?? null
}

export function venueBookingReadiness(bookings, now = new Date()) {
  const needs = new Map()
  for (const booking of bookings) {
    const id = venueNeedId(booking, bookings)
    if (!id) return { ready: false, total: 0, approved: 0 }
    if (!needs.has(id)) needs.set(id, [])
    needs.get(id).push(booking)
  }
  let approved = 0
  for (const chain of needs.values()) {
    const current = chain.filter((item) => !chain.some((other) => other.replacesId === item.id))
    if (current.length === 1 && effectiveVenueBookingStatus(current[0], now) === BOOKING_APPROVED) approved++
  }
  return { ready: needs.size > 0 && approved === needs.size, total: needs.size, approved }
}

// The stored decision is preserved; a pending request becomes effectively expired at its deadline,
// before the hourly task records the expired status.
export function pendingVenueBookings(bookings, now = new Date()) {
  return bookings.filter((booking) => effectiveVenueBookingStatus(booking, now) === BOOKING_PENDING)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function canRequestVenue(user, event) {
  return rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event) && event.status === PLANNING
}

export function canReadVenueBooking(user, event, booking) {
  return (rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)) ||
    (rolesOf(user).includes(VENUE_STAFF) && booking.assignedVenueStaffUid === user.uid)
}

export function canRejectVenueBooking(user, event, booking, now = new Date()) {
  return rolesOf(user).includes(VENUE_STAFF) && booking.assignedVenueStaffUid === user.uid &&
    event.status === PLANNING && effectiveVenueBookingStatus(booking, now) === BOOKING_PENDING
}

export function canApproveVenueBooking(user, event, booking, now = new Date()) {
  return canRejectVenueBooking(user, event, booking, now)
}

export function venueBookingApprovalErrors(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { request: 'An approval action is required.' }
  const errors = {}
  for (const key of Object.keys(input)) if (key !== 'action') errors[key] = 'This field cannot be set.'
  if (input.action !== 'approve') errors.action = 'Choose Approve.'
  return errors
}

// Layout review uses the submitted booking requirements, not the event's original preference.
// Current event attendance and structured facility/accessibility requirements still apply.
// Availability is checked separately under the venue lock, excluding only the verified own hold.
export function venueBookingSuitability(event, booking, venue) {
  const requirements = typeof booking.requirements === 'string' ? booking.requirements.trim() : ''
  const result = checkVenueSuitability({ ...event, core: { ...event.core,
    preferredDateTime: booking.startsAt,
    durationHours: (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 3600000,
    expectedAttendees: booking.attendeeCount ?? event.core?.expectedAttendees,
  }, venue: { ...event.venue, layoutPreference: requirements || event.venue?.layoutPreference } }, venue)
  // Requirements are free text: do not claim to have parsed extra instructions as a layout.
  if (requirements) result.warnings = result.warnings.map((warning) => warning.check === LAYOUT
    ? { ...warning, message: `Booking requirements "${requirements}" do not exactly match a supported layout (${venue.supportedLayouts?.join(', ') || 'none recorded'}). Venue Staff must review the requested layout and any additional instructions.` }
    : warning)
  return result
}

export function normaliseVenueBookingRejection(input) {
  const errors = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: {}, errors: { request: 'A rejection is required.' } }
  for (const key of Object.keys(input)) if (!['action', 'reason', 'suggestedAlternative'].includes(key)) errors[key] = 'This field cannot be set.'
  if (input.action !== 'reject') errors.action = 'Choose Reject.'
  const text = (key, required) => {
    if (input[key] != null && typeof input[key] !== 'string') errors[key] = 'Enter text for this field.'
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if (required && !value) errors[key] = 'Enter a reason.'
    if (value.length > 4000) errors[key] = 'Use at most 4000 characters.'
    return value
  }
  return { value: { reason: text('reason', true), suggestedAlternative: text('suggestedAlternative', false) }, errors }
}

export function normaliseVenueBooking(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: {}, errors: { request: 'A booking request object is required.' } }
  const errors = {}
  const allowed = ['venueId', 'startsAt', 'endsAt', 'attendeeCount', 'requirements', 'specialRequests', 'submissionKey', 'replacesId']
  for (const key of Object.keys(input)) if (!allowed.includes(key)) errors[key] = 'This field cannot be set.'
  const range = validateAvailabilityRange({ from: input.startsAt, to: input.endsAt })
  if (range.errors.from) errors.startsAt = range.errors.from
  if (range.errors.to) errors.endsAt = range.errors.to
  if (!Number.isInteger(input.attendeeCount) || input.attendeeCount <= 0) errors.attendeeCount = 'Enter a positive whole number of attendees.'
  const text = (key, required = false) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if ((required && !value) || (input[key] != null && typeof input[key] !== 'string')) errors[key] = 'Enter text for this field.'
    if (value.length > 4000) errors[key] = 'Use at most 4000 characters.'
    return value
  }
  const value = {
    venueId: text('venueId', true), startsAt: range.from?.toISOString() ?? null,
    endsAt: range.to?.toISOString() ?? null, attendeeCount: input.attendeeCount, requirements: text('requirements', true),
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
export function chooseVenueStaff(users, bookings, lastUid, now = new Date()) {
  const pendingAssignees = bookings.filter((b) => effectiveVenueBookingStatus(b, now) === BOOKING_PENDING).map((b) => b.assignedVenueStaffUid)
  return chooseStaff(users, VENUE_STAFF, pendingAssignees, lastUid)
}
