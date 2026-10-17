// SPM-17 — the Event Coordinator records and submits an event's equipment requirements for Technical
// Support Staff to review (review and reservation are SPM-56 / SPM-62 / SPM-36).
//
// Pure functions: no Firebase, no I/O. Stored in the equipmentRequests collection, one document per request,
// linked to its event by eventRequestId (backend/src/services/equipmentRequestService.js):
//   { eventRequestId, eventTitle, items: [{ equipmentTypeId, equipmentTypeName, quantity, technicalRequirements }],
//     requiredPeriod: { startsAt, endsAt }, status, assignedTechnicalStaffUid, assignedTechnicalStaffName,
//     submissionKey, replacesId, replacedById?, createdByUid, createdAt,
//     approvedByUid?, approvedByName?, approvedAt?, reconfirmedByUid?, reconfirmedAt? }   (SPM-56)
// The event carries a summary of its current request as top-level metadata, currentEquipmentRequest:
// { id, status } (SPM-56), so the shared sign-off rules, which see only the event, know a request exists.
// The request names equipment types and quantities, never physical units: units are chosen at reservation
// (SPM-62). The Organiser's free-text `equipment` section on the event is left as it is.

import { COORDINATOR, TECHNICAL_STAFF, VENUE_STAFF, isAssignedCoordinator, rolesOf } from './permissions.js'
import { PLANNING } from './status.js'
import { ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT, arrangementDecision } from './arrangementDecisions.js'

export const EQUIPMENT_REQUESTS_COLLECTION = 'equipmentRequests'

// SPM-17 creates Pending Review; SPM-56 approves it (Approved); SPM-62 is expected to move Approved to Reserved
// once units are reserved; SPM-36 rejects (Rejected). Closed is set when the event is rejected or cancelled.
export const EQUIPMENT_REQUEST_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  RESERVED: 'reserved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
})

export const EQUIPMENT_REQUEST_STATUS_LABELS = Object.freeze({
  [EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW]: 'Pending Review',
  [EQUIPMENT_REQUEST_STATUS.APPROVED]: 'Approved',
  [EQUIPMENT_REQUEST_STATUS.RESERVED]: 'Reserved',
  [EQUIPMENT_REQUEST_STATUS.REJECTED]: 'Rejected',
  [EQUIPMENT_REQUEST_STATUS.CLOSED]: 'Closed',
})

export const EQUIPMENT_REQUESTED = 'equipment_requested'
export const EQUIPMENT_REQUEST_APPROVED = 'equipment_request_approved'
export const EQUIPMENT_REQUEST_APPROVAL_RECONFIRMED = 'equipment_request_approval_reconfirmed'

// [Team decisions, 17 Oct 2026 — SPM-17, pending PO confirmation]
export const MAX_EQUIPMENT_REQUEST_ITEMS = 50
export const MAX_TECHNICAL_REQUIREMENTS_LENGTH = 500

const ALLOWED_FIELDS = Object.freeze(['items', 'submissionKey'])
const REFERENCE = /^[A-Za-z0-9_-]{1,128}$/

function reference(value) {
  if (typeof value !== 'string' || value.trim() === '') return { error: 'Choose an equipment type.' }
  const trimmed = value.trim()
  if (!REFERENCE.test(trimmed)) return { error: 'Choose an equipment type from the catalogue.' }
  return { value: trimmed }
}

// A whole number of at least 1. A string of digits is accepted, so the form can send what was typed.
function quantity(value) {
  const number = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) {
    return { error: 'Enter a whole number of 1 or more.' }
  }
  return { value: number }
}

function technicalRequirements(value) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string') return { error: 'Must be text.' }
  const trimmed = value.trim()
  if (trimmed.length > MAX_TECHNICAL_REQUIREMENTS_LENGTH) {
    return { error: `Must be ${MAX_TECHNICAL_REQUIREMENTS_LENGTH} characters or fewer.` }
  }
  return { value: trimmed || null }
}

/**
 * The request as submitted, validated and tidied: { value: { items, submissionKey }, errors }. Error keys
 * name the field (`items`, `items.0.quantity`, ...), so the page can mark the affected row. Whether each
 * equipment type exists is checked by the service against the catalogue.
 */
export function normaliseEquipmentRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value: { items: [], submissionKey: '' }, errors: { request: 'An equipment request object is required.' } }
  }
  const errors = {}
  for (const key of Object.keys(input)) if (!ALLOWED_FIELDS.includes(key)) errors[key] = 'This field cannot be set.'

  const submissionKey = typeof input.submissionKey === 'string' ? input.submissionKey.trim() : ''
  if (!REFERENCE.test(submissionKey)) errors.submissionKey = 'A submission reference is required.'

  const items = []
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.items = 'Add at least one equipment item.'
  } else if (input.items.length > MAX_EQUIPMENT_REQUEST_ITEMS) {
    errors.items = `A request can have at most ${MAX_EQUIPMENT_REQUEST_ITEMS} items.`
  } else {
    const seen = new Set()
    input.items.forEach((item, index) => {
      const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
      const path = `items.${index}`
      const results = {
        equipmentTypeId: reference(source.equipmentTypeId),
        quantity: quantity(source.quantity),
        technicalRequirements: technicalRequirements(source.technicalRequirements),
      }
      for (const [field, result] of Object.entries(results)) if (result.error) errors[`${path}.${field}`] = result.error
      const typeId = results.equipmentTypeId.value
      if (typeId && seen.has(typeId)) errors[`${path}.equipmentTypeId`] = 'This equipment type is already in the request. Change its quantity instead.'
      if (typeId) seen.add(typeId)
      items.push({
        equipmentTypeId: typeId ?? null,
        quantity: results.quantity.value ?? null,
        technicalRequirements: results.technicalRequirements.value ?? null,
      })
    })
  }

  return { value: { items, submissionKey }, errors }
}

/** May this user create an equipment request for the event now? The assigned Coordinator, at Planning. */
export function canRequestEquipment(user, event) {
  return rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event) && event.status === PLANNING
}

/**
 * May this user read this equipment request? The event's assigned Coordinator, and the Technical Support
 * Staff member the request is assigned to. Organisers, Venue Staff and Attendees cannot.
 */
export function canReadEquipmentRequest(user, event, request) {
  return (rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)) ||
    (rolesOf(user).includes(TECHNICAL_STAFF) && user?.uid != null && request.assignedTechnicalStaffUid === user.uid)
}

/**
 * The Technical Support Staff member to reuse for a new request, or null when one must be chosen
 * (team decision, 17 Oct 2026, pending PO confirmation):
 *   (a) the assignee of the event's most recent earlier equipment request, while they hold the role;
 *   (b) a member of assignedStaffUids holding Technical Support but not Venue Staff, lowest uid first;
 *   (c) a member of assignedStaffUids holding both roles, lowest uid first.
 * `users` are profiles with `uid`; `earlierRequests` are the event's equipment requests.
 */
export function technicalStaffToReuse(event, earlierRequests, users) {
  const byUid = new Map(users.map((user) => [user.uid, user]))
  const holdsTechnical = (uid) => rolesOf(byUid.get(uid)).includes(TECHNICAL_STAFF)

  const latest = [...earlierRequests]
    .filter((request) => request.assignedTechnicalStaffUid)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
  if (latest && holdsTechnical(latest.assignedTechnicalStaffUid)) return byUid.get(latest.assignedTechnicalStaffUid)

  const assigned = [...new Set(event.assignedStaffUids ?? [])].filter(holdsTechnical).sort()
  const technicalOnly = assigned.find((uid) => !rolesOf(byUid.get(uid)).includes(VENUE_STAFF))
  if (technicalOnly) return byUid.get(technicalOnly)
  return assigned.length ? byUid.get(assigned[0]) : null
}

/** The event's most recent rejected request that no later request has replaced, or null. */
export function rejectedRequestToReplace(requests) {
  return [...requests]
    .filter((request) => request.status === EQUIPMENT_REQUEST_STATUS.REJECTED && !request.replacedById)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null
}

// --- SPM-56: the event's summary of its current request -------------------------------------------

/** The summary stored on the event as currentEquipmentRequest. */
export function equipmentRequestSummary(id, status) {
  return { id, status }
}

/**
 * Does the event have an equipment request that is still current (anything but Closed)? Read from the
 * event's summary; an event with no summary (no request, or one made before SPM-56) has none.
 */
export function hasCurrentEquipmentRequest(event) {
  const status = event?.currentEquipmentRequest?.status
  return typeof status === 'string' && status !== EQUIPMENT_REQUEST_STATUS.CLOSED
}

// --- SPM-56: Technical Support Staff decide a request ---------------------------------------------
//
// The client sends an action, never a status, to POST /api/requests/:id/equipment-requests/:requestId/actions.
// SPM-36 is expected to add a 'reject' action here and to equipmentDecision() below.

export const APPROVE_EQUIPMENT_REQUEST = 'approve'
// [Temporary — until SPM-87] SPM-10 clears the technical sign-off on a significant change while the request
// stays Approved; re-confirming checks availability again and sets the sign-off again.
export const RECONFIRM_EQUIPMENT_APPROVAL = 'reconfirm_approval'
export const EQUIPMENT_REQUEST_ACTIONS = Object.freeze([APPROVE_EQUIPMENT_REQUEST, RECONFIRM_EQUIPMENT_APPROVAL])

// Refusal reasons, in the order they are checked. The service maps each to an HTTP status.
export const UNKNOWN_EQUIPMENT_ACTION = 'unknown_equipment_action'
export const NOT_TECHNICAL_STAFF = 'not_technical_staff'
export const NOT_REQUEST_ASSIGNEE = 'not_request_assignee'
export const EVENT_NOT_AT_PLANNING = 'event_not_at_planning'
export const REQUEST_NOT_PENDING_REVIEW = 'request_not_pending_review'
export const REQUEST_NOT_APPROVED = 'request_not_approved'
export const SIGN_OFF_ALREADY_APPROVED = 'sign_off_already_approved'

/**
 * May this user take `action` on this request now? { allowed: true } or { allowed: false, reason }.
 * Only the request's assigned Technical Support Staff member, who must also be on the event's
 * assignedStaffUids, and only while the event is at Planning (SPM-56 AC1).
 */
export function equipmentDecision(user, event, request, action) {
  if (!EQUIPMENT_REQUEST_ACTIONS.includes(action)) return { allowed: false, reason: UNKNOWN_EQUIPMENT_ACTION }
  if (!rolesOf(user).includes(TECHNICAL_STAFF)) return { allowed: false, reason: NOT_TECHNICAL_STAFF }
  const assignee = user?.uid != null && request?.assignedTechnicalStaffUid === user.uid
  if (!assignee || !(event?.assignedStaffUids ?? []).includes(user.uid) || request?.eventRequestId !== event?.id) {
    return { allowed: false, reason: NOT_REQUEST_ASSIGNEE }
  }
  if (event.status !== PLANNING) return { allowed: false, reason: EVENT_NOT_AT_PLANNING }
  if (action === APPROVE_EQUIPMENT_REQUEST && request.status !== EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW) {
    return { allowed: false, reason: REQUEST_NOT_PENDING_REVIEW }
  }
  if (action === RECONFIRM_EQUIPMENT_APPROVAL) {
    if (request.status !== EQUIPMENT_REQUEST_STATUS.APPROVED) return { allowed: false, reason: REQUEST_NOT_APPROVED }
    if (arrangementDecision(event, TECHNICAL_ARRANGEMENT) === ARRANGEMENT_APPROVED) return { allowed: false, reason: SIGN_OFF_ALREADY_APPROVED }
  }
  return { allowed: true }
}

/** The actions this user may take on this request now, for the page to offer. */
export function equipmentRequestActions(user, event, request) {
  return EQUIPMENT_REQUEST_ACTIONS.filter((action) => equipmentDecision(user, event, request, action).allowed)
}
