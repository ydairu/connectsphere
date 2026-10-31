// SPM-10 — significant changes to event information, and what they set off.
//
// Pure functions: no Firebase, no I/O. PATCH /api/requests/:id validates and normalises the significant
// fields of a patch with normaliseSignificantPatch(), refuses a significant change while a cancellation
// request is open (significantChangeBlocked), and, inside the transaction that saves the edit, applies
// significantChangeEffects(): recorded sign-offs marked "Changed since approval" for the Coordinator to review
// (SPM-87, shared/signOffReview.js), Confirmed and Preparation back to Planning, the safety approval withdrawn,
// and the assigned staff notified. shared/changeHistory.js marks the field_changed entries of these fields.
//
// "Significant date/time, duration, attendance, venue/layout, or equipment changes trigger formal re-review
// and may alter Planning/confirmation status." — effective-requirements.md §7 (Customer-confirmed).
// The field list and the effects are the SPM-10 acceptance criteria of 8 Oct 2026; accessibility as a
// significant venue requirement is a team interpretation (effective-requirements.md §7, SPM-10).
//
// Every field not listed here is ordinary: an edit to it is applied with no other effect.

import { hasOpenCancellation } from './cancellationRequests.js'
import { SIGNIFICANT_CHANGE_NOTICE, significantChangeNotifications } from './notifications.js'
import { INVALIDATED_BY_SIGNIFICANT_CHANGE, safetyReviewInvalidation } from './safetyReviewState.js'
import { MARKING_STATUSES, signOffReviewOnChange } from './signOffReview.js'
import { CONFIRMED, DRAFT, PLANNING, PREPARATION } from './status.js'

// --- Classification -------------------------------------------------------------------------------

export const SIGNIFICANT_FIELDS = Object.freeze([
  'core.preferredDateTime',
  'core.durationHours',
  'core.expectedAttendees',
  'venue.layoutPreference',
  'venue.accessibilityRequired',
  'venue.accessibilityNeeds',
  'equipment.requirements',
  'equipment.technicalSupportNeeded',
])

// Shown in notifications. The same wording as the request page (frontend/src/utils/requestSections.js).
export const SIGNIFICANT_FIELD_LABELS = Object.freeze({
  'core.preferredDateTime': 'Preferred date and time',
  'core.durationHours': 'Duration (hours)',
  'core.expectedAttendees': 'Expected attendees',
  'venue.layoutPreference': 'Layout preference',
  'venue.accessibilityRequired': 'Accessibility required',
  'venue.accessibilityNeeds': 'Accessibility needs',
  'equipment.requirements': 'Equipment required',
  'equipment.technicalSupportNeeded': 'Technical support needed',
})

export function isSignificantField(path) {
  return SIGNIFICANT_FIELDS.includes(path)
}

/** The significant field paths in a section-keyed patch, in SIGNIFICANT_FIELDS order. */
export function significantFieldsIn(patch) {
  return SIGNIFICANT_FIELDS.filter((path) => {
    const [section, name] = path.split('.')
    const fields = patch?.[section]
    return fields !== null && typeof fields === 'object' && Object.hasOwn(fields, name)
  })
}

// --- Validation and normalisation -----------------------------------------------------------------

const MAX_TEXT_LENGTH = 2000
const REQUIRED = 'Required.'

// [Team decision, 8 Oct 2026] From Submitted onwards (Returned included) these cannot be cleared; a draft
// may stay incomplete (SPM-4/SPM-7), so for a draft an empty value is stored as null, as the draft rules do.
export const REQUIRED_SIGNIFICANT_FIELDS = Object.freeze([
  'core.preferredDateTime',
  'core.durationHours',
  'core.expectedAttendees',
  'venue.layoutPreference',
])

const isEmpty = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

function numberFrom(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

// Each returns { value } or { error }, for a value that is not empty. Same rules as the draft form
// (shared/eventRequest.js) for numbers, dates and text; stricter for flags and lists after submission.
const NORMALISERS = {
  'core.preferredDateTime': (value) => {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return { error: 'Must be a valid date/time.' }
    return { value: new Date(value).toISOString() }
  },
  'core.durationHours': (value) => {
    const number = numberFrom(value)
    if (!Number.isFinite(number) || number <= 0) return { error: 'Must be a positive number.' }
    return { value: number }
  },
  'core.expectedAttendees': (value) => {
    const number = numberFrom(value)
    if (!Number.isInteger(number) || number <= 0) return { error: 'Must be a positive whole number.' }
    return { value: number }
  },
  'venue.layoutPreference': (value) => text(value),
  'venue.accessibilityNeeds': (value) => text(value),
  'venue.accessibilityRequired': (value, { draft }) => flag(value, draft),
  'equipment.technicalSupportNeeded': (value, { draft }) => flag(value, draft),
  'equipment.requirements': (value, { draft }) => list(value, draft),
}

function text(value) {
  if (typeof value !== 'string') return { error: 'Must be text.' }
  const trimmed = value.trim()
  if (trimmed.length > MAX_TEXT_LENGTH) return { error: `Must be ${MAX_TEXT_LENGTH} characters or fewer.` }
  return { value: trimmed }
}

function flag(value, draft) {
  // The draft rule stores anything but true as false; after submission the value must be a real boolean.
  if (draft) return { value: value === true }
  if (typeof value !== 'boolean') return { error: 'Must be true or false.' }
  return { value }
}

function list(value, draft) {
  // The draft rule also accepts one item per line in a string.
  const items = draft && typeof value === 'string' ? value.split('\n') : value
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) return { error: 'Must be a list of text values.' }
  return { value: items.map((item) => item.trim()).filter(Boolean) }
}

// The empty value as stored: an empty list, false for a flag, null otherwise.
function emptyValue(path) {
  if (path === 'equipment.requirements') return []
  if (path === 'venue.accessibilityRequired' || path === 'equipment.technicalSupportNeeded') return false
  return null
}

/** One significant field's value as it would be stored, or { error }. `draft` applies the draft rules. */
export function normaliseSignificantValue(path, value, { draft = false } = {}) {
  if (isEmpty(value)) {
    if (!draft && REQUIRED_SIGNIFICANT_FIELDS.includes(path)) return { error: REQUIRED }
    return { value: emptyValue(path) }
  }
  return NORMALISERS[path](value, { draft })
}

// Equality by meaning: the same instant, the same number, the same list in the same order; a missing value
// equals its empty form (null, [] or false). A stored value that does not normalise is compared as it is.
function comparable(path, value) {
  const result = normaliseSignificantValue(path, value, { draft: true })
  return result.error ? value : result.value
}

export function sameSignificantValue(path, a, b) {
  return JSON.stringify(comparable(path, a)) === JSON.stringify(comparable(path, b))
}

/**
 * Validates and normalises the significant fields of a section-keyed patch against `request` (the record
 * being edited). Returns { patch, errors }: `patch` has each significant value as it will be stored, and
 * drops a significant field whose value means the same as the stored one ("80" and 80, the same time in
 * another format), so it is not a change; a section left with no fields is dropped too. Other fields pass
 * through unchanged — validating ordinary fields is not part of SPM-10.
 */
export function normaliseSignificantPatch(request, patch) {
  const draft = request?.status === DRAFT
  const errors = {}
  const next = {}
  for (const [section, fields] of Object.entries(patch ?? {})) {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
      next[section] = fields
      continue
    }
    const kept = {}
    for (const [name, value] of Object.entries(fields)) {
      const path = `${section}.${name}`
      if (!isSignificantField(path)) {
        kept[name] = value
        continue
      }
      const result = normaliseSignificantValue(path, value, { draft })
      if (result.error) {
        errors[path] = result.error
        continue
      }
      if (sameSignificantValue(path, request?.[section]?.[name], result.value)) continue
      kept[name] = result.value
    }
    if (Object.keys(kept).length > 0) next[section] = kept
  }
  return { patch: next, errors }
}

/** The significant fields whose value differs between `before` and `after`, in SIGNIFICANT_FIELDS order. */
export function significantChanges(before, after) {
  return SIGNIFICANT_FIELDS.filter((path) => {
    const [section, name] = path.split('.')
    return !sameSignificantValue(path, before?.[section]?.[name], after?.[section]?.[name])
  })
}

// --- Effects --------------------------------------------------------------------------------------

export const SIGNIFICANT_CHANGE = 'significant_change'

// [Team decision, 8 Oct 2026 — SPM-10 AC7] An open cancellation request (pending or returned) can only be
// decided while the event is Confirmed or in Preparation (shared/cancellationRequests.js, APPROVE_CANCELLATION),
// so a significant change that moved the event back to Planning would leave it undecidable.
export const CANCELLATION_REQUEST_OPEN = 'cancellation_request_open'
export const CANCELLATION_REQUEST_OPEN_MESSAGE =
  'This event has an open cancellation request. Decide the cancellation request before changing the date, time, duration, attendance, venue or equipment. Other details can still be edited.'

/** Is a significant change to this request refused right now? Confirmed or Preparation with an open cancellation request. */
export function significantChangeBlocked(request) {
  return [CONFIRMED, PREPARATION].includes(request?.status) && hasOpenCancellation(request)
}

// Statuses at which a significant change has effects beyond the edit (SPM-87 AC1, AC3).
const RESET_STATUSES = MARKING_STATUSES
// Statuses a significant change moves back to Planning (SPM-10, SPM-87 AC3).
const RETURN_TO_PLANNING_STATUSES = Object.freeze([CONFIRMED, PREPARATION])

/**
 * What a saved edit sets off at Planning, Confirmed or Preparation, given the record before and after it and
 * the event's venue bookings (`bookings`, read before the save):
 *   { significantFields, metadata, statusChange, notifications }
 * - metadata: top-level fields to write with the edit — `signOffReview` marking the recorded sign-offs
 *   "Changed since approval" (SPM-87 AC1; they are kept, not cleared — CL3 G8!C51), `status: 'planning'` from
 *   Confirmed or Preparation (SPM-87 AC3), and `safetyReview` when a safety approval or a pending safety check
 *   is withdrawn (SPM-91 AC6). Empty when nothing changes.
 * - statusChange: { fromStatus, toStatus, fields } for the status_changed entry, or null.
 * - notifications: one per assigned staff member in `staffRecipientUids` (already filtered to Venue and
 *   Technical Support Staff), never to `user`.
 * Confirmed or Preparation → Planning is an effect of the edit only; it is not an action in
 * shared/statusTransitions.js.
 */
export function significantChangeEffects(user, before, after, { at, staffRecipientUids = [], bookings = [] } = {}) {
  const significantFields = significantChanges(before, after)
  const none = { significantFields, metadata: {}, statusChange: null, notifications: [] }
  if (significantFields.length === 0 || !RESET_STATUSES.includes(before?.status)) return none

  const metadata = {}
  const signOffReview = signOffReviewOnChange(before, bookings, { fields: significantFields, at: at ?? null })
  if (signOffReview) metadata.signOffReview = signOffReview
  const safetyReview = safetyReviewInvalidation(before, INVALIDATED_BY_SIGNIFICANT_CHANGE, at ?? null)
  if (safetyReview) metadata.safetyReview = safetyReview
  let statusChange = null
  if (RETURN_TO_PLANNING_STATUSES.includes(before.status)) {
    metadata.status = PLANNING
    statusChange = { fromStatus: before.status, toStatus: PLANNING, fields: significantFields }
  }
  const notifications = significantChangeNotifications(before, user, {
    recipientUids: staffRecipientUids,
    fieldLabels: significantFields.map((path) => SIGNIFICANT_FIELD_LABELS[path]),
    status: metadata.status ?? before.status,
    at,
  })
  return { significantFields, metadata, statusChange, notifications }
}

/** Whether saving this patch could need the staff recipients: Planning, Confirmed or Preparation and a significant field in it. */
export function mayNotifyStaff(request, patch) {
  return RESET_STATUSES.includes(request?.status) && significantFieldsIn(patch).length > 0 && (request.assignedStaffUids ?? []).length > 0
}

export { SIGNIFICANT_CHANGE_NOTICE }
