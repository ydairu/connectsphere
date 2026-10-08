// SPM-48 — venue and equipment preparation status.
//
// Pure functions: no Firebase, no I/O. Imported by shared/permissions.js (the edit condition and the
// display rule), the backend (validation) and the frontend (labels), so each rule exists once.
//
// Two sections on an event request, each { status, notes }:
//   venuePreparation      edited by assigned Venue Staff
//   equipmentPreparation  edited by assigned Technical Support Staff
// Who may view and edit them is in SECTION_ACCESS (shared/permissions.js); when they may be edited is
// canUpdateVenuePreparation / canUpdateEquipmentPreparation below. Preparation is internal: Organisers and
// Attendees never receive it, nor its change history (effective-requirements.md §7, SPM-48).
//
// This file must not import permissions.js or arrangements.js: permissions.js imports this file, and a
// circular import fails at module load. Sign-off is read through arrangementDecisions.js instead.

import { ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT, VENUE_ARRANGEMENT, arrangementDecision } from './arrangementDecisions.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, REJECTED } from './status.js'

// --- Sections and values --------------------------------------------------------------------------

export const VENUE_PREPARATION = 'venuePreparation'
export const EQUIPMENT_PREPARATION = 'equipmentPreparation'
export const PREPARATION_SECTIONS = Object.freeze([VENUE_PREPARATION, EQUIPMENT_PREPARATION])

// "Not Started, In Progress and Ready" — SPM-48 AC2.
export const PREPARATION_NOT_STARTED = 'not_started'
export const PREPARATION_IN_PROGRESS = 'in_progress'
export const PREPARATION_READY = 'ready'
export const PREPARATION_STATUSES = Object.freeze([PREPARATION_NOT_STARTED, PREPARATION_IN_PROGRESS, PREPARATION_READY])

export const PREPARATION_STATUS_LABELS = Object.freeze({
  [PREPARATION_NOT_STARTED]: 'Not Started',
  [PREPARATION_IN_PROGRESS]: 'In Progress',
  [PREPARATION_READY]: 'Ready',
})

export const PREPARATION_FIELDS = Object.freeze(['status', 'notes'])

// [Team decision, 7 Oct 2026] The customer set no limit; 2,000 characters keeps notes to a short summary.
export const PREPARATION_NOTES_MAX_LENGTH = 2000

// "Each section starts as Not Started" — SPM-48 AC2. Not written on create: a missing section reads as this.
export const DEFAULT_PREPARATION = Object.freeze({ status: PREPARATION_NOT_STARTED, notes: '' })

export function isPreparationSection(section) {
  return PREPARATION_SECTIONS.includes(section)
}

/** The section's value with defaults for anything missing: { status, notes }. */
export function preparationSection(request, section) {
  const stored = request?.[section]
  const value = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  return { ...DEFAULT_PREPARATION, ...value }
}

// --- When it may be edited ------------------------------------------------------------------------

const PREPARATION_EDITABLE_STATUSES = Object.freeze([PLANNING, CONFIRMED])
const CLOSED_STATUSES = Object.freeze([COMPLETED, CANCELLED, REJECTED])

// TEMPORARY (SPM-48): uses SPM-9 sign-off until SPM-54 / SPM-56/SPM-62 are built.
// Replace with the approved booking / reserved equipment.

/**
 * May the venue preparation section be updated on this request now? Planning or Confirmed, with the venue
 * sign-off approved (SPM-48 AC3, AC5). Who may update it is decided separately, by SECTION_ACCESS.
 */
export function canUpdateVenuePreparation(request) {
  return PREPARATION_EDITABLE_STATUSES.includes(request?.status) && arrangementDecision(request, VENUE_ARRANGEMENT) === ARRANGEMENT_APPROVED
}

/**
 * May the equipment preparation section be updated on this request now? Planning or Confirmed, with the
 * technical sign-off approved (SPM-48 AC4, AC5).
 */
export function canUpdateEquipmentPreparation(request) {
  return PREPARATION_EDITABLE_STATUSES.includes(request?.status) && arrangementDecision(request, TECHNICAL_ARRANGEMENT) === ARRANGEMENT_APPROVED
}

// Used by shared/permissions.js: a preparation section is editable only while its condition holds.
export const PREPARATION_CONDITIONS = Object.freeze({
  [VENUE_PREPARATION]: canUpdateVenuePreparation,
  [EQUIPMENT_PREPARATION]: canUpdateEquipmentPreparation,
})

// Why a preparation section is read-only, for the staff role that edits it.
export const PREPARATION_EVENT_CLOSED = 'event_closed'
export const PREPARATION_SIGN_OFF_PENDING = 'sign_off_pending'
export const PREPARATION_NOT_IN_PLANNING = 'not_in_planning'

/**
 * Why `section` cannot be updated on this request now, or null if its condition holds. Derived from the
 * condition functions above, so the reason and the server's decision cannot disagree.
 */
export function preparationReadOnlyReason(section, request) {
  if (!isPreparationSection(section) || PREPARATION_CONDITIONS[section](request)) return null
  if (CLOSED_STATUSES.includes(request?.status)) return PREPARATION_EVENT_CLOSED
  if (!PREPARATION_EDITABLE_STATUSES.includes(request?.status)) return PREPARATION_NOT_IN_PLANNING
  return PREPARATION_SIGN_OFF_PENDING
}

// --- When it is shown -----------------------------------------------------------------------------

// [Team decision, 7 Oct 2026] Display rule only: preparation is shown from Planning onwards, the closed
// statuses included. Writes are still decided by the conditions above, whatever is shown.
const PREPARATION_DISPLAY_STATUSES = Object.freeze([PLANNING, CONFIRMED, COMPLETED, CANCELLED, REJECTED])

export function preparationShown(request) {
  return PREPARATION_DISPLAY_STATUSES.includes(request?.status)
}

// --- Validation -----------------------------------------------------------------------------------

/**
 * Field errors for the preparation sections of a section-keyed patch, as { 'venuePreparation.status':
 * message }. Empty when they are valid or absent. Other sections are not checked (that is SPM-10).
 */
export function preparationPatchErrors(patch) {
  const errors = {}
  for (const section of PREPARATION_SECTIONS) {
    const fields = patch?.[section]
    if (fields === undefined) continue
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
      errors[section] = 'Expected an object of fields.'
      continue
    }
    for (const [name, value] of Object.entries(fields)) {
      const path = `${section}.${name}`
      if (name === 'status') {
        if (!PREPARATION_STATUSES.includes(value)) errors[path] = `Must be one of: ${PREPARATION_STATUSES.join(', ')}.`
      } else if (name === 'notes') {
        if (typeof value !== 'string') errors[path] = 'Must be text.'
        else if (value.length > PREPARATION_NOTES_MAX_LENGTH) errors[path] = `Must be ${PREPARATION_NOTES_MAX_LENGTH} characters or fewer.`
      } else {
        errors[path] = 'Unknown field.'
      }
    }
  }
  return errors
}
