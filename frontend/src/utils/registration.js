import { CLOSED, NOT_OPEN_YET, REGISTERED, UNAVAILABLE_MESSAGES, WAITLISTED } from '../../../shared/registration.js'
import { CANCELLED, COMPLETED, PLANNING, REJECTED } from '../../../shared/status.js'

// SPM-19 — how registration times, reasons and statuses read on the pages. The rules are in
// shared/registration.js; the API sends the reason, this file only words it.

export function displayDateTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Why an Attendee cannot register now, with the opening or closing time where that is the reason. */
export function unavailableText(summary) {
  if (summary?.reason === NOT_OPEN_YET && displayDateTime(summary.opensAt)) return `Registration opens ${displayDateTime(summary.opensAt)}.`
  if (summary?.reason === CLOSED && displayDateTime(summary.closesAt)) return `Registration closed ${displayDateTime(summary.closesAt)}.`
  return UNAVAILABLE_MESSAGES[summary?.reason] ?? 'Registration is not available.'
}

const STATUS_LABELS = Object.freeze({ [REGISTERED]: 'Registered', [WAITLISTED]: 'Waitlisted' })

/** "Registered", or (SPM-39) "Waitlisted, position N" when the position is known. */
export function registrationStatusLabel(status, waitingListPosition = null) {
  const label = STATUS_LABELS[status] ?? status
  return status === WAITLISTED && waitingListPosition ? `${label}, position ${waitingListPosition}` : label
}

/** "Venue A, Venue B", or null when no venue is known yet. */
export function venueText(venueNames) {
  return Array.isArray(venueNames) && venueNames.length > 0 ? venueNames.join(', ') : null
}

// SPM-41: what "My registrations" says about an event that is no longer simply going ahead.
const EVENT_STATUS_NOTES = Object.freeze({
  [CANCELLED]: 'Event cancelled',
  [REJECTED]: 'Event cancelled',
  [PLANNING]: 'Event being rearranged',
  [COMPLETED]: 'Event held',
})

export function eventStatusNote(status) {
  return EVENT_STATUS_NOTES[status] ?? null
}
