import { RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { TERMINAL_STATUSES } from '../../../shared/statusTransitions.js'

// Presentation of an event's arrangements: the sign-off wording shared by every card that shows it, and
// the SPM-64 summary of what the Organiser requested. Pure functions over what the API already sends
// (the projected request and `arrangements`); nothing here decides access.

// Before Planning nobody can sign off yet (shared/arrangements.js: decisions are made at Planning), so the
// state is "not started" rather than "awaiting approval". Once the event is Completed, Cancelled or Rejected
// (SPM-9's TERMINAL_STATUSES) an undecided sign-off will never be made, so it reads "not reviewed".
// A decision, or "not required", reads the same at every status. [Team decision, 4 Oct 2026, SPM-64]
export const PRE_PLANNING_STATUSES = Object.freeze([SUBMITTED, UNDER_REVIEW, RETURNED])
export const NOT_STARTED = 'Not started — reviewed during planning'
export const NOT_REVIEWED_CLOSED = 'Not reviewed — event closed'
export const AWAITING_APPROVAL = 'Awaiting approval'
export const NOT_REQUIRED = 'Not required'
const DECISION_TEXT = Object.freeze({ approved: 'Approved', rejected: 'Rejected' })

/** The sign-off wording for one arrangement summary ({ required, decision }) at the event's status. */
export function signOffText(arrangement, status) {
  if (!arrangement.required) return NOT_REQUIRED
  if (DECISION_TEXT[arrangement.decision]) return DECISION_TEXT[arrangement.decision]
  if (TERMINAL_STATUSES.includes(status)) return NOT_REVIEWED_CLOSED
  return PRE_PLANNING_STATUSES.includes(status) ? NOT_STARTED : AWAITING_APPROVAL
}

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function hours(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return `${value} ${value === 1 ? 'hour' : 'hours'}`
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * SPM-64 AC5 — the rows of "Your event arrangements": date and time, venue and equipment, each as the
 * Organiser requested it, with the sign-off state where one applies. Venue bookings are not shown yet, so the
 * venue is what was requested. SPM-62: once equipment is reserved, the reserved types and quantities
 * (`reservedEquipment` from the API, never unit ids) are shown in place of the requested list.
 *
 * @returns {{ label: string, requested: string, reserved?: string, signOff: string | null }[]}
 */
export function arrangementRows(request, arrangements, reservedEquipment = null) {
  const core = request.core ?? {}
  const venue = request.venue ?? {}
  const equipment = request.equipment ?? {}

  const when = [formatDateTime(core.preferredDateTime), hours(core.durationHours)].filter(Boolean).join(' · ')

  const accessibility = venue.accessibilityRequired === true ? text(venue.accessibilityNeeds) ?? 'Accessibility required' : null
  const venueText = [text(venue.layoutPreference) && `${text(venue.layoutPreference)} layout`, accessibility].filter(Boolean).join(' · ')

  const items = Array.isArray(equipment.requirements) ? equipment.requirements.filter((item) => text(item)) : []
  const support = equipment.technicalSupportNeeded === true ? 'technical support' : null
  const equipmentText = [...items, support].filter(Boolean).join(', ')

  const signOff = (arrangement) => (arrangement ? signOffText(arrangement, request.status) : null)

  return [
    { label: 'Date and time', requested: when || 'Not set', signOff: null },
    { label: 'Venue', requested: venueText || 'Not set', signOff: signOff(arrangements?.venue) },
    { label: 'Equipment', requested: equipmentText || 'None', ...reservedText(reservedEquipment), signOff: signOff(arrangements?.technical) },
  ]
}

function reservedText(reservedEquipment) {
  const items = Array.isArray(reservedEquipment?.items) ? reservedEquipment.items : []
  if (!items.length) return {}
  return { reserved: items.map((item) => `${item.quantity} × ${item.equipmentTypeName}`).join(', ') }
}
