// SPM-12 — search and filter catalogue venues by event requirements.
//
// Every filter is optional, and a venue is returned only when it meets all of the filters applied.
// Location, layout, facility and accessibility options are the values recorded in the venue
// catalogue; they match regardless of letter case and extra spaces. Date/time availability is
// venueAvailableFor below.

import { findVenueConflict } from './venueConflicts.js'

const MAX_FILTER_TEXT_LENGTH = 160

/**
 * SPM-75: is `venue` free for the searched period? The period is treated as a booking request would be
 * by SPM-16's findVenueConflict, so search and booking agree: both sides' setup and turnaround count,
 * maintenance blocks use their own times, and expired tentative holds do not block. `venue` must be the
 * full venue record (with setupMinutes/turnaroundMinutes); `commitments` are its venueAvailability entries.
 */
export function venueAvailableFor(venue, commitments, { startsAt, endsAt }, now = new Date()) {
  return findVenueConflict({ candidate: { venueId: venue.id, startsAt, endsAt }, venue, commitments, now }) === null
}

export const EMPTY_VENUE_SEARCH_FILTERS = Object.freeze({
  attendance: null,
  location: null,
  layout: null,
  facilities: Object.freeze([]),
  accessibility: Object.freeze([]),
})

export function venueSearchKey(value) {
  return typeof value === 'string' ? cleanText(value).toLowerCase() : ''
}

// Takes the query string as Express parses it: a repeated parameter (facility, accessibility)
// arrives as an array. Error keys are the query parameter names.
export function normaliseVenueSearchQuery(query = {}) {
  const errors = {}
  const source = query ?? {}

  const filters = {
    attendance: collect(errors, 'attendance', optionalAttendance(source.attendance)),
    location: collect(errors, 'location', optionalSingleText(source.location, 'location')),
    layout: collect(errors, 'layout', optionalSingleText(source.layout, 'layout')),
    facilities: collect(errors, 'facility', optionalTextList(source.facility)),
    accessibility: collect(errors, 'accessibility', optionalTextList(source.accessibility)),
  }

  return { filters, errors }
}

export function venueMatchesFilters(venue, filters = EMPTY_VENUE_SEARCH_FILTERS) {
  const { attendance = null, location = null, layout = null, facilities = [], accessibility = [] } = filters

  if (attendance !== null && !(Number(venue.maximumCapacity) >= attendance)) return false
  if (location !== null && venueSearchKey(venue.location) !== venueSearchKey(location)) return false
  if (layout !== null && !recordsEvery(venue.supportedLayouts, [layout])) return false
  return recordsEvery(venue.facilities, facilities) && recordsEvery(venue.accessibilityFeatures, accessibility)
}

// The choices offered to the Coordinator, taken from the whole catalogue so that they do not
// shrink once a filter is applied.
export function buildVenueFilterOptions(venues = []) {
  return {
    locations: distinctValues(venues.map((venue) => venue.location)),
    layouts: distinctValues(venues.flatMap((venue) => listOf(venue.supportedLayouts))),
    facilities: distinctValues(venues.flatMap((venue) => listOf(venue.facilities))),
    accessibilityFeatures: distinctValues(venues.flatMap((venue) => listOf(venue.accessibilityFeatures))),
  }
}

function cleanText(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function collect(errors, path, result) {
  if (result.error) errors[path] = result.error
  return result.value
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function optionalAttendance(value) {
  if (isBlank(value)) return { value: null }
  if (Array.isArray(value)) return { value: null, error: 'Enter one expected attendance.' }

  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    return { value: null, error: 'Expected attendance must be a positive whole number.' }
  }
  return { value: number }
}

function optionalSingleText(value, label) {
  if (isBlank(value)) return { value: null }
  if (Array.isArray(value)) return { value: null, error: `Choose one ${label}.` }
  if (typeof value !== 'string') return { value: null, error: 'Must be text.' }

  const cleaned = cleanText(value)
  if (cleaned.length > MAX_FILTER_TEXT_LENGTH) {
    return { value: null, error: `Must be ${MAX_FILTER_TEXT_LENGTH} characters or fewer.` }
  }
  return { value: cleaned }
}

function optionalTextList(value) {
  if (value === undefined || value === null) return { value: [] }

  const items = Array.isArray(value) ? value : [value]
  const byKey = new Map()
  for (const item of items) {
    if (typeof item !== 'string') return { value: [], error: 'Must contain only text values.' }
    const cleaned = cleanText(item)
    if (!cleaned) continue
    if (cleaned.length > MAX_FILTER_TEXT_LENGTH) {
      return { value: [], error: `Each value must be ${MAX_FILTER_TEXT_LENGTH} characters or fewer.` }
    }
    if (!byKey.has(cleaned.toLowerCase())) byKey.set(cleaned.toLowerCase(), cleaned)
  }

  return { value: [...byKey.values()] }
}

function listOf(value) {
  return Array.isArray(value) ? value : []
}

function recordsEvery(recorded, required) {
  if (required.length === 0) return true
  const keys = new Set(listOf(recorded).map(venueSearchKey))
  return required.every((value) => keys.has(venueSearchKey(value)))
}

function distinctValues(values) {
  const byKey = new Map()
  for (const value of values) {
    const key = venueSearchKey(value)
    if (key && !byKey.has(key)) byKey.set(key, cleanText(value))
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}
