// SPM-20 / SPM-40 — an Organiser requests changes to their submitted event; the assigned Coordinator accepts,
// declines or returns the request.
//
// Pure functions: no Firebase, no I/O. The backend writes every step through the section-edit save
// (requestController.js), so an accepted change gets exactly what a Coordinator's own edit gets: field history,
// SPM-10's return to Planning, SPM-87's "Changed since approval" marking, the safety approval withdrawn and the
// reschedule notices to Attendees (SPM-41). Submitting, declining and returning change no event field.
//
// "Significant changes ... trigger re-review. If essential changes cannot be met, return for modification or
// reject. Post-confirmation changes do not automatically unbook existing arrangements." — effective-requirements.md
// §4.19. Rules marked [Team decision pending] are choices the sources left open (§4.19).
//
// Requests are record metadata, stored at the top level so no section edit can write them. The last entry is the
// current one, and earlier ones are kept:
//   changeRequests: [{ status, changes: { section: { field: value } }, significant, reason, requestedByUid, requestedAt,
//                      resubmittedAt?, decidedByUid?, decidedAt?, decisionReason?, closedAt? }]

import { EVENT_STARTED, eventHasStarted, hasOpenCancellation } from './cancellationRequests.js'
import { CHANGE_PENDING, currentChangeRequest } from './changeRequestState.js'
import { NOT_PERMITTED, isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import { CANCELLATION_REQUEST_OPEN, isSignificantField, normaliseSignificantPatch, significantChangeBlocked } from './significantChanges.js'
import { recordedSignOffs, TECHNICAL_SIGN_OFF, VENUE_SIGN_OFF } from './signOffReview.js'
import { CONFIRMED, PLANNING, PREPARATION, SUBMITTED, UNDER_REVIEW } from './status.js'
import { LAYOUT } from './venueSuitability.js'

export { CANCELLATION_REQUEST_OPEN, EVENT_STARTED, NOT_PERMITTED }
export * from './changeRequestState.js'

export const CHANGE_RETURNED = 'returned'
export const CHANGE_ACCEPTED = 'accepted'
export const CHANGE_DECLINED = 'declined'
// The event was closed while the request was open.
export const CHANGE_CLOSED = 'closed'

export const ACCEPT_CHANGE = 'accept'
export const DECLINE_CHANGE = 'decline'
export const RETURN_CHANGE = 'return'
export const CHANGE_DECISIONS = Object.freeze([ACCEPT_CHANGE, DECLINE_CHANGE, RETURN_CHANGE])

const DECISION_STATUS = Object.freeze({ [ACCEPT_CHANGE]: CHANGE_ACCEPTED, [DECLINE_CHANGE]: CHANGE_DECLINED, [RETURN_CHANGE]: CHANGE_RETURNED })

// Reasons an action is refused.
export const CHANGE_NOT_ELIGIBLE = 'change_request_not_eligible'
export const NO_COORDINATOR_ASSIGNED = 'no_coordinator_assigned'
export const CHANGE_ALREADY_PENDING = 'change_request_already_pending'
export const NO_OPEN_CHANGE_REQUEST = 'no_open_change_request'
export const UNKNOWN_CHANGE_DECISION = 'unknown_change_decision'

// [Team decision pending — SPM-20] Eligible: after submission, before the event closes. A Returned request is
// edited directly by its Organiser (SPM-42), so it needs no change request.
export const CHANGE_REQUEST_STATUSES = Object.freeze([SUBMITTED, UNDER_REVIEW, PLANNING, CONFIRMED, PREPARATION])

// "Permitted changes": the Organiser's own event details. Registration settings have their own edit (SPM-19).
const ORDINARY_TEXT = Object.freeze({ 'core.title': 160, 'core.purpose': 2000, 'core.description': 2000 })
const REQUIRED_ORDINARY = Object.freeze(['core.title', 'core.purpose'])
export const CHANGE_REQUEST_FIELDS = Object.freeze([
  ...Object.keys(ORDINARY_TEXT),
  'core.preferredDateTime',
  'core.durationHours',
  'core.expectedAttendees',
  'venue.layoutPreference',
  'venue.accessibilityRequired',
  'venue.accessibilityNeeds',
  'equipment.requirements',
  'equipment.technicalSupportNeeded',
])

export const MAX_CHANGE_REASON_LENGTH = 1000

// --- Reads ----------------------------------------------------------------------------------------

/** Is a request open: awaiting the Coordinator, or returned to the Organiser? */
export function hasOpenChangeRequest(event) {
  const status = currentChangeRequest(event)?.status
  return status === CHANGE_PENDING || status === CHANGE_RETURNED
}

function changedPaths(changes) {
  return Object.entries(changes ?? {}).flatMap(([section, fields]) => Object.keys(fields ?? {}).map((name) => `${section}.${name}`))
}

/** Does the request change any field SPM-10 classifies as significant? */
export function isSignificantChangeRequest(request) {
  return changedPaths(request?.changes).some(isSignificantField)
}

// --- Who may act ----------------------------------------------------------------------------------

/**
 * May this user submit a change request now, or resubmit one that was returned? The owning Organiser, at an
 * eligible status, once a Coordinator is assigned, before the event starts. [Team decision pending — SPM-20]
 * One open request at a time, and none while a cancellation request is open.
 */
export function canSubmitChangeRequest(user, event, now = new Date()) {
  if (!CHANGE_REQUEST_STATUSES.includes(event.status)) return { allowed: false, reason: CHANGE_NOT_ELIGIBLE }
  if (!isOwningOrganiser(user, event)) return { allowed: false, reason: NOT_PERMITTED }
  if (event.assignedCoordinatorUid == null) return { allowed: false, reason: NO_COORDINATOR_ASSIGNED }
  if (hasOpenCancellation(event)) return { allowed: false, reason: CANCELLATION_REQUEST_OPEN }
  if (currentChangeRequest(event)?.status === CHANGE_PENDING) return { allowed: false, reason: CHANGE_ALREADY_PENDING }
  if (eventHasStarted(event, now)) return { allowed: false, reason: EVENT_STARTED }
  return { allowed: true }
}

/**
 * May this user take `decision` on the current request now? Only the assigned Coordinator. A pending request may
 * be accepted, declined or returned; a returned one may only be declined, so it cannot be left open for good.
 * Accepting also needs the event not to have started, and follows SPM-10 AC7: a significant change waits for an
 * open cancellation request to be decided.
 */
export function canDecideChangeRequest(user, event, decision, now = new Date()) {
  if (!CHANGE_DECISIONS.includes(decision)) return { allowed: false, reason: UNKNOWN_CHANGE_DECISION }
  if (!isAssignedCoordinator(user, event)) return { allowed: false, reason: NOT_PERMITTED }
  if (!CHANGE_REQUEST_STATUSES.includes(event.status)) return { allowed: false, reason: CHANGE_NOT_ELIGIBLE }
  const current = currentChangeRequest(event)
  const decidable = current?.status === CHANGE_PENDING || (current?.status === CHANGE_RETURNED && decision === DECLINE_CHANGE)
  if (!decidable) return { allowed: false, reason: NO_OPEN_CHANGE_REQUEST }
  if (decision === ACCEPT_CHANGE) {
    if (eventHasStarted(event, now)) return { allowed: false, reason: EVENT_STARTED }
    if (isSignificantChangeRequest(current) && significantChangeBlocked(event)) return { allowed: false, reason: CANCELLATION_REQUEST_OPEN }
  }
  return { allowed: true }
}

// --- Validation -----------------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalReason(value, errors, path) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors[path] = 'Must be text.'
    return ''
  }
  const text = value.trim()
  if (text.length > MAX_CHANGE_REASON_LENGTH) errors[path] = `Must be ${MAX_CHANGE_REASON_LENGTH} characters or fewer.`
  return text
}

/**
 * Validates { changes: { section: { field: value } }, reason? } against `event`. Significant values follow SPM-10's
 * rules (normaliseSignificantPatch). A value that means the same as the stored one is dropped, and a request that
 * changes nothing is refused. Returns { value: { changes, reason }, errors }, errors keyed by field path.
 */
export function normaliseChangeRequest(event, input) {
  if (!isPlainObject(input)) return { value: null, errors: { request: 'Expected the changes to request.' } }
  const errors = {}
  for (const key of Object.keys(input)) if (key !== 'changes' && key !== 'reason') errors[key] = 'This field cannot be set.'
  if (!isPlainObject(input.changes)) return { value: null, errors: { ...errors, changes: 'Change at least one field.' } }

  const ordinary = {}
  const significant = {}
  for (const [section, fields] of Object.entries(input.changes)) {
    if (!isPlainObject(fields)) {
      errors[section] = 'Expected an object of fields.'
      continue
    }
    for (const [name, value] of Object.entries(fields)) {
      const path = `${section}.${name}`
      if (!CHANGE_REQUEST_FIELDS.includes(path)) {
        errors[path] = 'This field cannot be changed by a change request.'
      } else if (isSignificantField(path)) {
        significant[section] = { ...significant[section], [name]: value }
      } else {
        const text = typeof value === 'string' ? value.trim() : value ?? ''
        if (typeof text !== 'string') errors[path] = 'Must be text.'
        else if (text === '' && REQUIRED_ORDINARY.includes(path)) errors[path] = 'Required.'
        else if (text.length > ORDINARY_TEXT[path]) errors[path] = `Must be ${ORDINARY_TEXT[path]} characters or fewer.`
        else if (text !== (event[section]?.[name] ?? '')) ordinary[section] = { ...ordinary[section], [name]: text === '' ? null : text }
      }
    }
  }
  const normalised = normaliseSignificantPatch(event, significant)
  Object.assign(errors, normalised.errors)

  const changes = {}
  for (const source of [ordinary, normalised.patch]) {
    for (const [section, fields] of Object.entries(source)) changes[section] = { ...changes[section], ...fields }
  }
  if (Object.keys(errors).length === 0 && Object.keys(changes).length === 0) errors.changes = 'Change at least one field.'
  return { value: { changes, reason: optionalReason(input.reason, errors, 'reason') }, errors }
}

/** Validates a decision's { reason? }: required to decline or return (SPM-40: "returned ... or rejected"). */
export function normaliseChangeDecision(decision, input) {
  const errors = {}
  const reason = optionalReason(input?.reason, errors, 'reason')
  if (!errors.reason && reason === '' && decision !== ACCEPT_CHANGE) errors.reason = 'Give the organiser a reason.'
  return { value: { reason }, errors }
}

// --- Writes ---------------------------------------------------------------------------------------

function withCurrent(event, update) {
  const requests = [...event.changeRequests]
  requests[requests.length - 1] = { ...requests.at(-1), ...update }
  return requests
}

/** The `changeRequests` to write for a new request, or for a returned one resubmitted with new values. */
export function changeRequestSubmission(user, event, { changes, reason }, at) {
  const fields = { status: CHANGE_PENDING, changes, reason: reason || null, significant: isSignificantChangeRequest({ changes }) }
  if (currentChangeRequest(event)?.status === CHANGE_RETURNED) return withCurrent(event, { ...fields, resubmittedAt: at })
  return [...(Array.isArray(event.changeRequests) ? event.changeRequests : []), { ...fields, requestedByUid: user.uid, requestedAt: at }]
}

/** The `changeRequests` to write for a decision. */
export function changeRequestDecision(user, event, decision, reason, at) {
  return withCurrent(event, { status: DECISION_STATUS[decision], decidedByUid: user.uid, decidedAt: at, decisionReason: reason || null })
}

/**
 * The section patch an accepted request saves: its changes, without any that now match the event (a Coordinator
 * may have made the same edit while the request waited). Goes through PATCH's save, never a separate write.
 */
export function acceptedChanges(event) {
  const { changes } = currentChangeRequest(event)
  const significant = normaliseSignificantPatch(event, changes).patch
  const patch = {}
  for (const [section, fields] of Object.entries(significant)) {
    for (const [name, value] of Object.entries(fields)) {
      if (isSignificantField(`${section}.${name}`) || value !== (event[section]?.[name] ?? null)) patch[section] = { ...patch[section], [name]: value }
    }
  }
  return patch
}

/** The `changeRequests` to write when the event closes, or null when no request is open. */
export function closedChangeRequests(event, at) {
  return hasOpenChangeRequest(event) ? withCurrent(event, { status: CHANGE_CLOSED, closedAt: at }) : null
}

// --- What each role sees --------------------------------------------------------------------------

/**
 * The current request as its owning Organiser or the assigned Coordinator sees it, or null. No uid is included.
 * `changes` lists each field with the event's value now and the value proposed; `significant` flags the request
 * for re-review (SPM-40). `decisions` are what this user may do now.
 */
export function changeRequestSummary(user, event, now = new Date()) {
  const current = currentChangeRequest(event)
  if (!current || !(isOwningOrganiser(user, event) || isAssignedCoordinator(user, event))) return null
  return {
    status: current.status,
    reason: current.reason ?? null,
    requestedAt: current.requestedAt ?? null,
    decisionReason: current.decisionReason ?? null,
    decidedAt: current.decidedAt ?? null,
    significant: isSignificantChangeRequest(current),
    changes: changedPaths(current.changes).map((field) => {
      const [section, name] = field.split('.')
      return { field, current: event[section]?.[name] ?? null, proposed: current.changes[section][name], significant: isSignificantField(field) }
    }),
    decisions: CHANGE_DECISIONS.filter((decision) => canDecideChangeRequest(user, event, decision, now).allowed),
  }
}

// --- What a change may affect (SPM-40 AC1) --------------------------------------------------------

const VENUE_AFFECTING = (field) => ['core.preferredDateTime', 'core.durationHours', 'core.expectedAttendees'].includes(field) || field.startsWith('venue.')
const TECHNICAL_AFFECTING = (field) => ['core.preferredDateTime', 'core.durationHours'].includes(field) || field.startsWith('equipment.')

/**
 * The recorded sign-offs the request's significant fields may affect, as SPM-87 review items. "May": which really
 * need re-approval is the Coordinator's decision after accepting (SPM-87).
 */
export function affectedArrangements(event, request, bookings, now = new Date()) {
  const fields = changedPaths(request?.changes).filter(isSignificantField)
  return recordedSignOffs(event, bookings, now).filter((item) =>
    (item.kind === VENUE_SIGN_OFF && fields.some(VENUE_AFFECTING)) || (item.kind === TECHNICAL_SIGN_OFF && fields.some(TECHNICAL_AFFECTING)))
}

/**
 * A venue's suitability findings that bear on the request. The layout is checked only when the request changes it:
 * a booking's layout was reviewed with the booking, and the event's preference may be worded differently from it.
 */
export function findingsForChange(request, findings) {
  const changesLayout = Object.hasOwn(request?.changes?.venue ?? {}, 'layoutPreference')
  return findings.filter((finding) => changesLayout || finding.check !== LAYOUT)
}

/** The event as it would be if the request were accepted, for checking venue suitability. */
export function eventWithChanges(event, request) {
  const next = { ...event }
  for (const [section, fields] of Object.entries(request?.changes ?? {})) next[section] = { ...event[section], ...fields }
  return next
}
