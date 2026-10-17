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
  EQUIPMENT_REQUESTED,
  EQUIPMENT_REQUESTS_COLLECTION,
  EQUIPMENT_REQUEST_STATUS,
  canReadEquipmentRequest,
  canRequestEquipment,
  normaliseEquipmentRequest,
  rejectedRequestToReplace,
  technicalStaffToReuse,
} from '../../../shared/equipmentRequest.js'
import { STAFF_ASSIGNMENT_LOCKS, chooseStaff } from '../../../shared/staffAssignment.js'
import { eventPeriod } from '../../../shared/venueSuitability.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EQUIPMENT_TYPES } from './equipmentService.js'

export class EquipmentRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'EquipmentRequestError'
    this.status = status
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
    tx.update(eventRef, { assignedStaffUids: [...new Set([...(event.assignedStaffUids ?? []), assignee.uid])], updatedAt: at })
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
  return {
    canSubmit: canRequestEquipment(user, event) && !requests.some((request) => request.status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW),
    requests: visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(presentEquipmentRequest),
  }
}

// SPM-17: when the event is rejected or cancelled, its Pending Review requests are closed in the same
// transaction. Reads only; returns the write phase, to run after every read in the transaction.
export async function prepareEquipmentRequestClose(tx, db, eventId, user, now, closedReason) {
  const pending = (await tx.get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('eventRequestId', '==', eventId))).docs
    .filter((doc) => doc.data().status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW)
  return () => {
    const at = now.toISOString()
    for (const doc of pending) {
      tx.update(doc.ref, { status: EQUIPMENT_REQUEST_STATUS.CLOSED, closedReason, closedByUid: user.uid, closedAt: at, updatedAt: at })
    }
  }
}
