// Attendee registration — SPM-19.
//
// Pure functions: no Firebase, no I/O. backend/src/services/registrationService.js loads the event, its
// registrations and its approved venues, and asks this module whether an Attendee may register.
//
// Customer rules (effective-requirements.md §4.18; Clarification 1 §7, Clarification 2 §2):
//   - "Registration opening and closing dates are configured by the Event Organiser."
//   - "Registration is capped at the event/venue capacity." / "should not exceed venue capacity."
//   - A person must register to attend.
// SPM-88: registration is open while the event is Confirmed or Preparation (registrationEligibleStatus).
//
// Team decisions of 28 Oct 2026 (SPM-19, effective-requirements.md §4.18):
//   D2  the limit is the smaller of the Organiser's capacity and the largest approved venue's capacity,
//       worked out when someone registers (SPM-90's primary venue replaces "largest" once it exists);
//   D3  the registered list (name, email, time) goes to the owning Organiser and the assigned Coordinator only;
//   D5  an event moved back to Planning keeps its registrations but takes no new ones.

import { ATTENDEE, COORDINATOR, ORGANISER, inScopeAs, isAssignedCoordinator, rolesOf } from './permissions.js'
import { registrationEligibleStatus } from './status.js'

export const REGISTRATIONS_COLLECTION = 'eventRegistrations'

// SPM-39 and SPM-59 add waitlisted, invited and withdrawn.
export const REGISTERED = 'registered'
export const ACTIVE_REGISTRATION_STATUSES = Object.freeze([REGISTERED])

// Why registration is unavailable, in the order they are checked.
export const NOT_ATTENDEE = 'not_attendee'
export const NOT_ENABLED = 'not_enabled'
export const WRONG_STATUS = 'wrong_status'
export const NOT_CONFIGURED = 'not_configured'
export const NOT_OPEN_YET = 'not_open_yet'
export const CLOSED = 'closed'
export const ALREADY_REGISTERED = 'already_registered'
export const FULL = 'full'

export const UNAVAILABLE_MESSAGES = Object.freeze({
  [NOT_ATTENDEE]: 'Only Attendees can register for events.',
  [NOT_ENABLED]: 'Registration is not enabled for this event.',
  [WRONG_STATUS]: 'Registration is open only while the event is confirmed.',
  [NOT_CONFIGURED]: 'The organiser has not set the registration period and capacity yet.',
  [NOT_OPEN_YET]: 'Registration has not opened yet.',
  [CLOSED]: 'Registration has closed.',
  [ALREADY_REGISTERED]: 'You are already registered for this event.',
  [FULL]: 'This event is full.',
})

/** The document id of `uid`'s registration for event `eventId`: one per Attendee per event. */
export function registrationId(eventId, uid) {
  return `${eventId}_${uid}`
}

function time(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

// --- Settings -------------------------------------------------------------------------------------

/**
 * Field errors for an event's registration settings, keyed like normaliseEventRequestInput ('registration.closesAt').
 * `registration` and `core` are the values as they will be saved. Values already in the wrong shape are
 * reported by normaliseEventRequestInput; this checks how they relate. `venueCapacity` is the largest approved
 * venue's capacity, or null when no venue is approved yet.
 */
export function registrationSettingsErrors(registration = {}, core = {}, venueCapacity = null) {
  const errors = {}
  const opensAt = time(registration.opensAt)
  const closesAt = time(registration.closesAt)
  const startsAt = time(core.preferredDateTime)
  if (opensAt !== null && closesAt !== null && opensAt >= closesAt) errors['registration.closesAt'] = 'Registration must close after it opens.'
  else if (closesAt !== null && startsAt !== null && closesAt > startsAt) errors['registration.closesAt'] = 'Registration must close by the event start.'
  const capacity = positiveInteger(registration.capacity)
  if (capacity !== null && venueCapacity !== null && capacity > venueCapacity) {
    errors['registration.capacity'] = `Capacity cannot be more than the venue capacity (${venueCapacity}).`
  }
  return errors
}

// --- Capacity -------------------------------------------------------------------------------------

/** D2: the largest maximumCapacity of the approved venues, or null when there is none. */
export function venueCapacityOf(venues = []) {
  const capacities = venues.map((venue) => positiveInteger(venue?.maximumCapacity)).filter((value) => value !== null)
  return capacities.length > 0 ? Math.max(...capacities) : null
}

/** D2: the smaller of the Organiser's capacity and the venue capacity; whichever is known; null if neither. */
export function effectiveCapacity(registration = {}, venueCapacity = null) {
  const limits = [positiveInteger(registration.capacity), positiveInteger(venueCapacity)].filter((value) => value !== null)
  return limits.length > 0 ? Math.min(...limits) : null
}

export function isActiveRegistration(record) {
  return ACTIVE_REGISTRATION_STATUSES.includes(record?.status)
}

// --- Availability ---------------------------------------------------------------------------------

/**
 * Whether registration is open on `event` for anyone, ignoring who is asking: { open, reason, capacity,
 * placesLeft }. `registeredCount` counts active registrations. Reasons are checked in order, so the first
 * thing an Attendee would have to wait for is the one reported.
 */
export function registrationAvailability(event, { venueCapacity = null, registeredCount = 0, now = new Date() } = {}) {
  const registration = event.registration ?? {}
  const capacity = effectiveCapacity(registration, venueCapacity)
  const placesLeft = capacity === null ? null : Math.max(capacity - registeredCount, 0)
  const result = (reason) => ({ open: reason === null, reason, capacity, placesLeft })

  if (registration.enabled !== true) return result(NOT_ENABLED)
  if (!registrationEligibleStatus(event.status)) return result(WRONG_STATUS)
  const opensAt = time(registration.opensAt)
  const closesAt = time(registration.closesAt)
  if (opensAt === null || closesAt === null || positiveInteger(registration.capacity) === null) return result(NOT_CONFIGURED)
  if (now.getTime() < opensAt) return result(NOT_OPEN_YET)
  if (now.getTime() >= closesAt) return result(CLOSED)
  if (placesLeft === 0) return result(FULL)
  return result(null)
}

/**
 * May `user` register for `event` now? { allowed, reason } plus the availability fields. `existing` is the
 * user's registration for this event, or null.
 */
export function canRegister(user, event, { existing = null, ...options } = {}) {
  const availability = registrationAvailability(event, options)
  const refuse = (reason) => ({ ...availability, allowed: false, reason })
  if (!rolesOf(user).includes(ATTENDEE)) return refuse(NOT_ATTENDEE)
  if (isActiveRegistration(existing)) return refuse(ALREADY_REGISTERED)
  if (!availability.open) return refuse(availability.reason)
  return { ...availability, allowed: true, reason: null }
}

// --- Who sees what --------------------------------------------------------------------------------

/** D3: the owning Organiser and the assigned Coordinator may see an event's registrations. */
export function canViewRegistrations(user, event) {
  const owner = inScopeAs(ORGANISER, user, event) && event.ownerUid === user?.uid
  const coordinator = rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)
  return owner || coordinator
}

/**
 * What the event page tells an Attendee about registering (`attendeeRegistration` in the response), or null for
 * a user without the Attendee role in scope. Never the `registration` section itself: its notes are the Organiser's.
 */
export function attendeeRegistrationSummary(user, event, { existing = null, venueNames = [], ...options } = {}) {
  if (!inScopeAs(ATTENDEE, user, event)) return null
  const decision = canRegister(user, event, { existing, ...options })
  return {
    canRegister: decision.allowed,
    reason: decision.reason,
    opensAt: event.registration?.opensAt ?? null,
    closesAt: event.registration?.closesAt ?? null,
    placesLeft: decision.placesLeft,
    venueNames,
    myRegistration: isActiveRegistration(existing) ? presentOwnRegistration(existing) : null,
  }
}

/** The event-page summary for users who may see the registered list (`registrations` in the response), or null. */
export function staffRegistrationSummary(user, event, { registeredCount = 0, venueCapacity = null } = {}) {
  if (!canViewRegistrations(user, event)) return null
  return { registeredCount, capacity: effectiveCapacity(event.registration ?? {}, venueCapacity) }
}

// --- Records --------------------------------------------------------------------------------------

/**
 * The registration document for `user` on `event`. The event's title, start, duration and venue names are kept
 * on it, so "My registrations" still shows them if the event later leaves the Attendee's view (D5).
 */
export function buildRegistration(event, user, { venueNames = [], at }) {
  return {
    eventRequestId: event.id,
    attendeeUid: user.uid,
    attendeeName: user.name ?? null,
    attendeeEmail: user.email ?? null,
    status: REGISTERED,
    eventTitle: event.core?.title ?? null,
    eventStartsAt: event.core?.preferredDateTime ?? null,
    eventDurationHours: event.core?.durationHours ?? null,
    venueNames,
    registeredAt: at,
    updatedAt: at,
  }
}

/** One of the Attendee's own registrations, as "My registrations" and the event page show it. */
export function presentOwnRegistration(record) {
  return {
    eventRequestId: record.eventRequestId,
    status: record.status,
    eventTitle: record.eventTitle,
    eventStartsAt: record.eventStartsAt,
    eventDurationHours: record.eventDurationHours,
    venueNames: record.venueNames ?? [],
    registeredAt: record.registeredAt,
  }
}

/** One row of the registered list for the owning Organiser or assigned Coordinator (D3). No uid is sent. */
export function presentRegistrant(record) {
  return { name: record.attendeeName, email: record.attendeeEmail, status: record.status, registeredAt: record.registeredAt }
}
