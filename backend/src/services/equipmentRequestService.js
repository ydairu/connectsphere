// SPM-17 — the assigned Event Coordinator submits an event's equipment request (equipment types and
// quantities) for Technical Support Staff review. Rules are in shared/equipmentRequest.js; staff choice in
// shared/staffAssignment.js. Follows SPM-14's venueBookingService: a linked top-level collection, a
// submission reference so a repeated submit is not saved twice, and everything written in one transaction.
//
// Concurrency: the event document is written by every submission, so two submissions for one event are
// serialised and the second sees the first one's Pending Review request. The Technical Support Staff
// rotation lock (systemLocks/technicalStaffAssignment) serialises choosing an assignee.

import { COORDINATOR, TECHNICAL_STAFF, isAssignedCoordinator, rolesOf } from '../../../shared/permissions.js'
import {
  APPROVE_EQUIPMENT_REQUEST,
  EQUIPMENT_REQUESTED,
  EQUIPMENT_REQUESTS_COLLECTION,
  EQUIPMENT_REQUEST_APPROVAL_RECONFIRMED,
  EQUIPMENT_REQUEST_APPROVED,
  EQUIPMENT_REQUEST_STATUS,
  EVENT_NOT_AT_PLANNING,
  NOT_REQUEST_ASSIGNEE,
  NOT_TECHNICAL_STAFF,
  REQUEST_NOT_APPROVED,
  REQUEST_NOT_PENDING_REVIEW,
  SIGN_OFF_ALREADY_APPROVED,
  UNKNOWN_EQUIPMENT_ACTION,
  canReadEquipmentRequest,
  canRequestEquipment,
  equipmentDecision,
  equipmentRequestActions,
  equipmentRequestSummary,
  normaliseEquipmentRequest,
  rejectedRequestToReplace,
  technicalStaffToReuse,
} from '../../../shared/equipmentRequest.js'
import { checkRequestAvailability, validateRequestedQuantities } from '../../../shared/equipmentAvailabilityCheck.js'
import { ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT } from '../../../shared/arrangementDecisions.js'
import { equipmentRequestApprovedNotifications } from '../../../shared/notifications.js'
import { STAFF_ASSIGNMENT_LOCKS, chooseStaff } from '../../../shared/staffAssignment.js'
import { eventPeriod } from '../../../shared/venueSuitability.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EQUIPMENT_TYPES, loadUnitsByType } from './equipmentService.js'
import { addNotifications } from './notificationService.js'
import { userActor } from './statusHistory.js'

// The same activity type as statusTransitionService's ARRANGEMENT_DECIDED; not imported, because
// statusTransitionService imports this file.
const ARRANGEMENT_DECIDED = 'arrangement_decided'

export class EquipmentRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'EquipmentRequestError'
    this.status = status
  }
}

// SPM-56: approval refused because the request cannot be fulfilled; `availability` is the per-item result.
export class EquipmentRequestShortfallError extends Error {
  constructor(availability) {
    super('This request cannot be fulfilled: at least one equipment type does not have enough available units.')
    this.name = 'EquipmentRequestShortfallError'
    this.status = 409
    this.availability = availability
  }
}

export class EquipmentRequestValidationError extends Error {
  constructor(errors) {
    super('Equipment request validation failed.')
    this.name = 'EquipmentRequestValidationError'
    this.errors = errors
  }
}

const rows = (snapshot) => snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
const hasErrors = (errors) => Object.keys(errors).length > 0
const sameItems = (left, right) =>
  JSON.stringify(left.map(({ equipmentTypeId, quantity, technicalRequirements }) => [equipmentTypeId, quantity, technicalRequirements])) ===
  JSON.stringify(right.map(({ equipmentTypeId, quantity, technicalRequirements }) => [equipmentTypeId, quantity, technicalRequirements]))

// A user without the Coordinator role gets 403; a Coordinator not assigned to the event gets the same 404
// as a missing event (AGENTS.md §6, SPM-65).
function requireAssignedCoordinator(user, event) {
  if (!rolesOf(user).includes(COORDINATOR)) throw new EquipmentRequestError(403, 'Only the assigned Coordinator can request equipment.')
  if (!isAssignedCoordinator(user, event)) throw new EquipmentRequestError(404, 'Event not found.')
}

export async function submitEquipmentRequest(eventId, input, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const eventSnapshot = await tx.get(eventRef)
    if (!eventSnapshot.exists) throw new EquipmentRequestError(404, 'Event not found.')
    const event = eventSnapshot.data()
    requireAssignedCoordinator(user, event)

    const { value, errors } = normaliseEquipmentRequest(input)
    if (hasErrors(errors)) throw new EquipmentRequestValidationError(errors)

    const requests = rows(await tx.get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('eventRequestId', '==', eventId)))
    const previousAttempt = requests.find((request) => request.submissionKey === value.submissionKey)
    if (previousAttempt) {
      if (!sameItems(previousAttempt.items, value.items)) {
        throw new EquipmentRequestError(409, 'This submission reference was already used. Reload before submitting again.')
      }
      return presentEquipmentRequest(previousAttempt)
    }
    if (!canRequestEquipment(user, event)) {
      throw new EquipmentRequestError(409, 'Equipment requests can only be submitted while the event is in Planning.')
    }
    if (requests.some((request) => request.status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW)) {
      throw new EquipmentRequestError(409, 'This event already has an equipment request waiting for review.')
    }
    // SPM-56 (team decision, 17 Oct 2026): an approved request must not be joined by a second one.
    if (requests.some((request) => request.status === EQUIPMENT_REQUEST_STATUS.APPROVED)) {
      throw new EquipmentRequestError(409, 'This event already has an approved equipment request.')
    }
    const requiredPeriod = eventPeriod(event)
    if (!requiredPeriod) throw new EquipmentRequestError(409, 'The event needs a date, time and duration before equipment can be requested.')

    // Every equipment type must be in the SPM-37 catalogue; its name is stored for display.
    const typeSnapshots = await Promise.all(value.items.map((item) => tx.get(db.collection(EQUIPMENT_TYPES).doc(item.equipmentTypeId))))
    const typeErrors = {}
    typeSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) typeErrors[`items.${index}.equipmentTypeId`] = 'Choose an equipment type from the catalogue.'
    })
    if (hasErrors(typeErrors)) throw new EquipmentRequestValidationError(typeErrors)

    const users = rows(await tx.get(db.collection('users'))).map((profile) => ({ ...profile, uid: profile.id }))
    let assignee = technicalStaffToReuse(event, requests, users)
    let lockRef = null
    if (!assignee) {
      lockRef = db.collection('systemLocks').doc(STAFF_ASSIGNMENT_LOCKS[TECHNICAL_STAFF])
      const lock = await tx.get(lockRef)
      const pending = rows(await tx.get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('status', '==', EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW)))
      assignee = chooseStaff(users, TECHNICAL_STAFF, pending.map((request) => request.assignedTechnicalStaffUid), lock.data()?.lastUid)
    }
    if (!assignee) throw new EquipmentRequestError(409, 'No Technical Support Staff account is available. The request has not been submitted.')

    const replaced = rejectedRequestToReplace(requests)
    const ref = db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc()
    const at = now.toISOString()
    const record = {
      eventRequestId: eventId,
      eventTitle: event.core?.title ?? '',
      items: value.items.map((item, index) => ({ ...item, equipmentTypeName: typeSnapshots[index].data().name })),
      requiredPeriod,
      status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW,
      assignedTechnicalStaffUid: assignee.uid,
      assignedTechnicalStaffName: assignee.name ?? 'Technical Support Staff',
      submissionKey: value.submissionKey,
      replacesId: replaced?.id ?? null,
      createdByUid: user.uid,
      createdAt: at,
    }

    tx.set(ref, record)
    if (replaced) tx.update(db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(replaced.id), { replacedById: ref.id, updatedAt: at })
    if (lockRef) tx.set(lockRef, { lastUid: assignee.uid, updatedAt: at })
    // SPM-56: the event's summary now names this request. A technical sign-off left from an earlier request
    // is cleared, because this request has not been reviewed yet (team decision, 17 Oct 2026).
    const eventUpdate = {
      assignedStaffUids: [...new Set([...(event.assignedStaffUids ?? []), assignee.uid])],
      currentEquipmentRequest: equipmentRequestSummary(ref.id, EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW),
      updatedAt: at,
    }
    if (event.arrangementApprovals?.[TECHNICAL_ARRANGEMENT]) {
      const { [TECHNICAL_ARRANGEMENT]: _cleared, ...kept } = event.arrangementApprovals
      eventUpdate.arrangementApprovals = kept
    }
    tx.update(eventRef, eventUpdate)
    tx.set(eventRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
      type: EQUIPMENT_REQUESTED,
      equipmentRequestId: ref.id,
      replacesId: record.replacesId,
      assignedTechnicalStaffUid: assignee.uid,
      actor: { type: 'user', uid: user.uid, name: user.name ?? null, role: COORDINATOR },
      at,
    })
    return presentEquipmentRequest({ id: ref.id, ...record })
  })
}

const PRESENTED_FIELDS = Object.freeze([
  'id', 'eventRequestId', 'eventTitle', 'items', 'requiredPeriod', 'status', 'assignedTechnicalStaffName',
  'replacesId', 'replacedById', 'createdAt', 'closedReason', 'closedAt',
  'approvedByName', 'approvedAt', 'reconfirmedByName', 'reconfirmedAt',
])

function presentEquipmentRequest(request) {
  return Object.fromEntries(PRESENTED_FIELDS.filter((key) => request[key] !== undefined).map((key) => [key, request[key]]))
}

// The event's equipment requests the user may read, newest first. Someone who is neither the assigned
// Coordinator nor the assignee of any of them gets the same 404 as a missing event.
export async function listEventEquipmentRequests(eventId, user, db = getAdminDb()) {
  const snapshot = await db.collection('eventRequests').doc(eventId).get()
  if (!snapshot.exists) throw new EquipmentRequestError(404, 'Event not found.')
  const event = { ...snapshot.data(), id: eventId }
  const requests = rows(await db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('eventRequestId', '==', eventId).get())
  const coordinator = rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)
  const visible = requests.filter((request) => canReadEquipmentRequest(user, event, request))
  if (!coordinator && !visible.length) throw new EquipmentRequestError(404, 'Event not found.')
  const blocking = [EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, EQUIPMENT_REQUEST_STATUS.APPROVED]
  return {
    canSubmit: canRequestEquipment(user, event) && !requests.some((request) => blocking.includes(request.status)),
    // SPM-56: each request carries the actions this user may take on it now, so the page offers only those.
    requests: visible
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({ ...presentEquipmentRequest(request), actions: equipmentRequestActions(user, event, request) })),
  }
}

// SPM-17 / SPM-56: when the event is rejected or cancelled, its Pending Review and Approved requests are
// closed in the same transaction (nothing is reserved yet). Reads only; returns the write phase, to run after
// every read in the transaction. The write phase returns the fields to add to the event's own update: the
// summary marked Closed when it named a request that was closed.
const CLOSABLE_STATUSES = Object.freeze([EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, EQUIPMENT_REQUEST_STATUS.APPROVED])

export async function prepareEquipmentRequestClose(tx, db, eventId, user, now, closedReason, currentSummary = null) {
  const open = (await tx.get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('eventRequestId', '==', eventId))).docs
    .filter((doc) => CLOSABLE_STATUSES.includes(doc.data().status))
  return () => {
    const at = now.toISOString()
    for (const doc of open) {
      tx.update(doc.ref, { status: EQUIPMENT_REQUEST_STATUS.CLOSED, closedReason, closedByUid: user.uid, closedAt: at, updatedAt: at })
    }
    const summaryClosed = currentSummary && open.some((doc) => doc.id === currentSummary.id)
    return summaryClosed ? { currentEquipmentRequest: equipmentRequestSummary(currentSummary.id, EQUIPMENT_REQUEST_STATUS.CLOSED) } : {}
  }
}

// --- SPM-56: Technical Support Staff approve a request ---------------------------------------------

const REFUSAL_STATUS = Object.freeze({
  [UNKNOWN_EQUIPMENT_ACTION]: 400,
  [NOT_TECHNICAL_STAFF]: 403,
  [NOT_REQUEST_ASSIGNEE]: 404,
  [EVENT_NOT_AT_PLANNING]: 409,
  [REQUEST_NOT_PENDING_REVIEW]: 409,
  [REQUEST_NOT_APPROVED]: 409,
  [SIGN_OFF_ALREADY_APPROVED]: 409,
})

const REFUSAL_MESSAGES = Object.freeze({
  [UNKNOWN_EQUIPMENT_ACTION]: 'Unknown action.',
  [NOT_TECHNICAL_STAFF]: 'Only Technical Support Staff can review equipment requests.',
  [NOT_REQUEST_ASSIGNEE]: 'Equipment request not found.',
  [EVENT_NOT_AT_PLANNING]: 'Equipment requests can only be approved while the event is in Planning.',
  [REQUEST_NOT_PENDING_REVIEW]: 'Only a request waiting for review can be approved.',
  [REQUEST_NOT_APPROVED]: 'Only an approved request can be re-confirmed.',
  [SIGN_OFF_ALREADY_APPROVED]: 'The technical arrangement is already approved; there is nothing to re-confirm.',
})

/**
 * SPM-56 — `action` ('approve' or 'reconfirm_approval') on an equipment request, by its assigned Technical
 * Support Staff member, in one transaction. The request's availability is checked again inside the
 * transaction (SPM-18's checkRequestAvailability); a request that cannot be fulfilled is refused with
 * EquipmentRequestShortfallError and nothing is written. Approving does not reserve units (SPM-62).
 * SPM-36 is expected to add 'reject' here.
 */
export async function decideEquipmentRequest(eventId, equipmentRequestId, action, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const eventRef = db.collection('eventRequests').doc(eventId)
    const requestRef = db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(equipmentRequestId)
    const [eventSnapshot, requestSnapshot] = await Promise.all([tx.get(eventRef), tx.get(requestRef)])
    // A role check first, so a user without the Technical Support role is refused before anything is revealed.
    if (!rolesOf(user).includes(TECHNICAL_STAFF)) throw refusal(NOT_TECHNICAL_STAFF)
    if (!eventSnapshot.exists || !requestSnapshot.exists) throw refusal(NOT_REQUEST_ASSIGNEE)
    const event = { ...eventSnapshot.data(), id: eventId }
    const request = { ...requestSnapshot.data(), id: equipmentRequestId }
    const decision = equipmentDecision(user, event, request, action)
    if (!decision.allowed) throw refusal(decision.reason)

    const items = Array.isArray(request.items) ? request.items : []
    const quantityErrors = validateRequestedQuantities(items)
    if (Object.keys(quantityErrors).length) throw new EquipmentRequestValidationError(quantityErrors)
    const unitsByType = await loadUnitsByType(db, items.map((item) => item.equipmentTypeId), (query) => tx.get(query))
    const availability = { equipmentRequestId, requiredPeriod: request.requiredPeriod ?? null, checkedAt: now.toISOString(), ...checkRequestAvailability(items, unitsByType) }
    if (!availability.fulfillable) throw new EquipmentRequestShortfallError(availability)

    const at = now.toISOString()
    const reconfirmed = action !== APPROVE_EQUIPMENT_REQUEST
    const actor = userActor(user)
    const requestUpdate = reconfirmed
      ? { reconfirmedByUid: user.uid, reconfirmedByName: user.name ?? null, reconfirmedAt: at, updatedAt: at }
      : { status: EQUIPMENT_REQUEST_STATUS.APPROVED, approvedByUid: user.uid, approvedByName: user.name ?? null, approvedAt: at, updatedAt: at }

    tx.update(requestRef, requestUpdate)
    tx.update(eventRef, {
      arrangementApprovals: { ...event.arrangementApprovals, [TECHNICAL_ARRANGEMENT]: { decision: ARRANGEMENT_APPROVED, byUid: user.uid, at } },
      currentEquipmentRequest: equipmentRequestSummary(equipmentRequestId, EQUIPMENT_REQUEST_STATUS.APPROVED),
      updatedAt: at,
    })
    const activity = eventRef.collection(ACTIVITY_SUBCOLLECTION)
    tx.set(activity.doc(), {
      type: reconfirmed ? EQUIPMENT_REQUEST_APPROVAL_RECONFIRMED : EQUIPMENT_REQUEST_APPROVED,
      equipmentRequestId,
      actor: { ...actor, role: TECHNICAL_STAFF },
      at,
      availability: {
        fulfillable: availability.fulfillable,
        items: availability.items.map(({ equipmentTypeId, requestedQuantity, availableQuantity }) => ({ equipmentTypeId, requestedQuantity, availableQuantity })),
      },
    })
    // The same entry the manual technical sign-off writes, so the sign-off history reads the same either way.
    tx.set(activity.doc(), { type: ARRANGEMENT_DECIDED, arrangement: TECHNICAL_ARRANGEMENT, decision: ARRANGEMENT_APPROVED, actor, at })
    addNotifications(tx, db, equipmentRequestApprovedNotifications(event, user, { equipmentRequestId, reconfirmed, at }))

    return { equipmentRequest: presentEquipmentRequest({ ...request, ...requestUpdate }), availability }
  })
}

function refusal(reason) {
  return new EquipmentRequestError(REFUSAL_STATUS[reason] ?? 409, REFUSAL_MESSAGES[reason] ?? 'Action not allowed.')
}

// --- SPM-56: the Technical Support Staff member's queue -------------------------------------------

const QUEUE_FIELDS = Object.freeze(['id', 'eventRequestId', 'eventTitle', 'status', 'requiredPeriod', 'items', 'createdAt', 'approvedAt'])

function presentQueueItem(request) {
  const item = Object.fromEntries(QUEUE_FIELDS.filter((key) => request[key] !== undefined).map((key) => [key, request[key]]))
  item.items = (request.items ?? []).map(({ equipmentTypeName, quantity }) => ({ equipmentTypeName, quantity }))
  return item
}

/** Every equipment request assigned to this Technical Support Staff member: Pending Review first, oldest first. */
export async function listAssignedEquipmentRequests(user, db = getAdminDb()) {
  if (!rolesOf(user).includes(TECHNICAL_STAFF)) throw new EquipmentRequestError(403, 'Only Technical Support Staff have an equipment request queue.')
  const requests = rows(await db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('assignedTechnicalStaffUid', '==', user.uid).get())
  const pendingFirst = (request) => (request.status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW ? 0 : 1)
  return {
    requests: requests
      .sort((a, b) => pendingFirst(a) - pendingFirst(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(presentQueueItem),
  }
}
