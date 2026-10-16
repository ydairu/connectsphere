// SPM-13 — whether a catalogue venue appears suitable for an event, and who may ask.
//
// Six checks (backlog AC1). Capacity overflow, a missing required facility and unavailability at the
// event's date/time make a venue unsuitable; an unsupported layout, a missing accessibility feature and
// operating hours give warnings, and the venue can still be selected (AC2). Every failure and warning is
// named (AC10). Setup/turnaround and several venues per event are SPM-76's.

import { isAssignedCoordinator } from './permissions.js'
import { PLANNING, UNDER_REVIEW } from './status.js'
import { formatSingaporePeriod, operatingHoursCheck } from './operatingHours.js'
import { AVAILABILITY_STATUS, activeCommitmentsInRange, isExpiredHold } from './venueAvailability.js'
import { venueSearchKey } from './venueSearch.js'

export const SUITABLE = 'suitable'
export const SUITABLE_WITH_WARNINGS = 'suitable_with_warnings'
export const UNSUITABLE = 'unsuitable'

export const CAPACITY = 'capacity'
export const AVAILABILITY = 'availability'
export const FACILITIES = 'facilities'
export const LAYOUT = 'layout'
export const ACCESSIBILITY = 'accessibility'
export const OPERATING_HOURS = 'operatingHours'

// Team decision C, 15 Oct 2026: the check is offered while the event is reviewed and planned.
export const SUITABILITY_STATUSES = Object.freeze([UNDER_REVIEW, PLANNING])

export const NOT_PERMITTED = 'not_permitted'
export const NOT_AVAILABLE_AT_STATUS = 'suitability_not_available'

// Team decision A1, 15 Oct 2026: the event's venue requirements that are not the Organiser's own
// fields. The assigned Coordinator chooses them from the facilities and accessibility features recorded
// in the venue catalogue, so they match catalogue values; they are stored in the event's venue section.
export const VENUE_REQUIREMENT_FIELDS = Object.freeze(['requiredFacilities', 'requiredAccessibilityFeatures'])

const MAX_REQUIREMENT_LENGTH = 160
const HOUR_MS = 60 * 60 * 1000

const MAINTENANCE_REASON_LABELS = Object.freeze({
  maintenance: 'maintenance',
  renovation: 'renovation',
  safety: 'safety reasons',
  internal_activity: 'an internal activity',
  other: 'another reason',
})

/** Why this user may not check venue suitability for this request now, or null if they may. */
export function suitabilityRefusal(user, request) {
  if (!isAssignedCoordinator(user, request)) return NOT_PERMITTED
  if (!SUITABILITY_STATUSES.includes(request.status)) return NOT_AVAILABLE_AT_STATUS
  return null
}

export function canCheckVenueSuitability(user, request) {
  return suitabilityRefusal(user, request) === null
}

/** The event's own period, from its preferred date/time and duration, or null if either is missing. */
export function eventPeriod(request) {
  const start = Date.parse(request?.core?.preferredDateTime ?? '')
  const hours = Number(request?.core?.durationHours)
  if (Number.isNaN(start) || !Number.isFinite(hours) || hours <= 0) return null
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(start + hours * HOUR_MS).toISOString() }
}

/** The stored requirements, as lists; an event saved before SPM-13 has none. */
export function venueRequirements(request) {
  const venue = request?.venue ?? {}
  return {
    requiredFacilities: Array.isArray(venue.requiredFacilities) ? venue.requiredFacilities : [],
    requiredAccessibilityFeatures: Array.isArray(venue.requiredAccessibilityFeatures) ? venue.requiredAccessibilityFeatures : [],
  }
}

function requirementList(value) {
  if (!Array.isArray(value)) return { error: 'Must be a list of text values.' }
  const byKey = new Map()
  for (const item of value) {
    if (typeof item !== 'string') return { error: 'Must contain only text values.' }
    const cleaned = item.trim().replace(/\s+/g, ' ')
    if (!cleaned) continue
    if (cleaned.length > MAX_REQUIREMENT_LENGTH) return { error: `Each value must be ${MAX_REQUIREMENT_LENGTH} characters or fewer.` }
    if (!byKey.has(cleaned.toLowerCase())) byKey.set(cleaned.toLowerCase(), cleaned)
  }
  return { value: [...byKey.values()] }
}

/**
 * Validates and tidies the requirement fields of a section-keyed request patch: trimmed, blanks dropped,
 * duplicates removed. Returns { patch, errors }, errors keyed by field path.
 */
export function normaliseVenueRequirementsPatch(patch) {
  const venue = patch?.venue
  if (venue === null || typeof venue !== 'object' || Array.isArray(venue)) return { patch, errors: {} }

  const errors = {}
  const normalised = { ...venue }
  for (const field of VENUE_REQUIREMENT_FIELDS) {
    if (!Object.hasOwn(venue, field)) continue
    const result = requirementList(venue[field])
    if (result.error) errors[`venue.${field}`] = result.error
    else normalised[field] = result.value
  }
  return { patch: { ...patch, venue: normalised }, errors }
}

function missingFrom(recorded, required) {
  const keys = new Set((Array.isArray(recorded) ? recorded : []).map(venueSearchKey))
  return required.filter((value) => !keys.has(venueSearchKey(value)))
}

function unavailabilityLabel(commitment) {
  if (commitment.status === AVAILABILITY_STATUS.CONFIRMED_BOOKING) return 'already booked'
  if (commitment.status === AVAILABILITY_STATUS.TENTATIVE_HOLD) return 'tentatively held for another event'
  return `blocked for ${MAINTENANCE_REASON_LABELS[commitment.reason] ?? 'maintenance'}`
}

/**
 * The suitability of `venue` for the event in `request`, given the venue's availability commitments:
 * { result, problems: [{ check, message }], warnings: [{ check, message }] }.
 *
 * The event's own bookings and holds are ignored, so an event is never unavailable to itself, and so are
 * expired tentative holds, as SPM-16's conflict check ignores them. Other events are named only by type
 * and time, never by title: a Coordinator sees only their own events.
 */
export function checkVenueSuitability(request, venue, commitments = [], now = new Date()) {
  const problems = []
  const warnings = []
  const period = eventPeriod(request)
  const { requiredFacilities, requiredAccessibilityFeatures } = venueRequirements(request)

  const attendance = request?.core?.expectedAttendees
  if (attendance === null || attendance === undefined) {
    warnings.push({ check: CAPACITY, message: 'Expected attendance is not recorded, so capacity was not checked.' })
  } else if (!(Number(venue.maximumCapacity) >= attendance)) {
    problems.push({
      check: CAPACITY,
      message: `Expected attendance (${attendance}) is above this venue's capacity (${venue.maximumCapacity ?? 'not recorded'}).`,
    })
  }

  if (!period) {
    warnings.push({
      check: AVAILABILITY,
      message: "The event's date, time or duration is not recorded, so availability and operating hours were not checked.",
    })
  } else {
    const clashes = activeCommitmentsInRange(
      commitments.filter(
        (commitment) => commitment.eventRequestId !== request.id && !isExpiredHold(commitment, now),
      ),
      { from: new Date(period.startsAt), to: new Date(period.endsAt) },
    )
    for (const clash of clashes) {
      problems.push({
        check: AVAILABILITY,
        message: `Not available: ${unavailabilityLabel(clash)}, ${formatSingaporePeriod(clash.startsAt, clash.endsAt)}.`,
      })
    }
  }

  for (const facility of missingFrom(venue.facilities, requiredFacilities)) {
    problems.push({ check: FACILITIES, message: `Missing required facility: ${facility}.` })
  }

  const layout = typeof request?.venue?.layoutPreference === 'string' ? request.venue.layoutPreference.trim() : ''
  if (layout && missingFrom(venue.supportedLayouts, [layout]).length > 0) {
    const supported = Array.isArray(venue.supportedLayouts) && venue.supportedLayouts.length > 0 ? venue.supportedLayouts.join(', ') : 'none recorded'
    warnings.push({ check: LAYOUT, message: `Layout "${layout}" is not supported by this venue (supported: ${supported}).` })
  }

  for (const feature of missingFrom(venue.accessibilityFeatures, requiredAccessibilityFeatures)) {
    warnings.push({ check: ACCESSIBILITY, message: `This venue is not marked as having ${feature}.` })
  }

  if (period && typeof venue.operatingHours === 'string' && venue.operatingHours.trim()) {
    const hours = operatingHoursCheck(venue.operatingHours, period)
    if (hours === 'outside') {
      warnings.push({ check: OPERATING_HOURS, message: `The event is outside this venue's operating hours (${venue.operatingHours.trim()}).` })
    } else if (hours === 'unreadable') {
      warnings.push({
        check: OPERATING_HOURS,
        message: `Operating hours could not be checked automatically ("${venue.operatingHours.trim()}"). Check them before selecting this venue.`,
      })
    }
  }

  const result = problems.length > 0 ? UNSUITABLE : warnings.length > 0 ? SUITABLE_WITH_WARNINGS : SUITABLE
  return { result, problems, warnings }
}

const RESULT_ORDER = Object.freeze([SUITABLE, SUITABLE_WITH_WARNINGS, UNSUITABLE])

/** Suitable venues first, then those with warnings, then unsuitable ones; by name within each group. */
export function compareSuitability(left, right) {
  return RESULT_ORDER.indexOf(left.result) - RESULT_ORDER.indexOf(right.result) || String(left.name).localeCompare(String(right.name))
}
