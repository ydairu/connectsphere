// SPM-18 — GET /api/requests/:id/equipment-requests/:requestId/availability. Rules are in
// shared/equipmentAvailabilityCheck.js. Read-only: nothing is written, and no transaction is needed.

import { CHECKABLE_REQUEST_STATUSES, canCheckEquipmentAvailability, checkRequestAvailability, validateRequestedQuantities } from '../../../shared/equipmentAvailabilityCheck.js'
import { EQUIPMENT_REQUESTS_COLLECTION } from '../../../shared/equipmentRequest.js'
import { TECHNICAL_STAFF, rolesOf } from '../../../shared/permissions.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { EquipmentRequestError, EquipmentRequestValidationError } from './equipmentRequestService.js'
import { EQUIPMENT_UNITS } from './equipmentService.js'

export async function checkEquipmentRequestAvailability(eventId, equipmentRequestId, user, db = getAdminDb(), now = new Date()) {
  // A user without the Technical Support role is refused outright (403). A Technical Support Staff member
  // who is not the request's assignee gets the same 404 as a missing event or request, as SPM-17's list does.
  if (!rolesOf(user).includes(TECHNICAL_STAFF)) {
    throw new EquipmentRequestError(403, 'Only Technical Support Staff can check equipment availability.')
  }

  const [eventSnapshot, requestSnapshot] = await Promise.all([
    db.collection('eventRequests').doc(eventId).get(),
    db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(equipmentRequestId).get(),
  ])
  const request = requestSnapshot.exists ? requestSnapshot.data() : null
  if (!eventSnapshot.exists || !request || request.eventRequestId !== eventId || !canCheckEquipmentAvailability(user, request)) {
    throw new EquipmentRequestError(404, 'Equipment request not found.')
  }
  if (!CHECKABLE_REQUEST_STATUSES.includes(request.status)) {
    throw new EquipmentRequestError(409, 'Availability can only be checked for a request that is waiting for review or reserved.')
  }

  const items = Array.isArray(request.items) ? request.items : []
  const errors = validateRequestedQuantities(items)
  if (Object.keys(errors).length) throw new EquipmentRequestValidationError(errors)

  const typeIds = [...new Set(items.map((item) => item.equipmentTypeId))]
  const snapshots = await Promise.all(typeIds.map((typeId) => db.collection(EQUIPMENT_UNITS).where('equipmentTypeId', '==', typeId).get()))
  const unitsByType = new Map(typeIds.map((typeId, index) => [typeId, snapshots[index].docs.map((doc) => doc.data())]))

  return {
    equipmentRequestId,
    requiredPeriod: request.requiredPeriod ?? null,
    checkedAt: now.toISOString(),
    ...checkRequestAvailability(items, unitsByType),
  }
}
