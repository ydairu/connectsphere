// SPM-62 — Technical Support Staff reserve the units of an approved equipment request (SPM-56).
// SPM-57 — units reserved for another overlapping event are not available.
//
// Pure functions: no Firebase, no I/O. One reservation document per reserved equipment type, in the
// equipmentReservations collection (backend/src/services/equipmentReservationService.js):
//   { eventRequestId, equipmentRequestId, equipmentTypeId, equipmentTypeName, quantity, unitIds,
//     startsAt, endsAt, status, reservedByUid, reservedByName, reservedAt, releasedAt?, releasedReason? }
// A reservation belongs to the event, never to a venue booking: it has no venue or booking field, so a
// venue booking change or cancellation cannot release it (SPM-57). Reservations do not expire.

import { isUsableUnit } from './equipment.js'
import { EQUIPMENT, TECHNICAL_STAFF, inScopeAs, viewableSectionsFor } from './permissions.js'
import { CANCELLED, COMPLETED, REJECTED } from './status.js'

export const EQUIPMENT_RESERVATIONS_COLLECTION = 'equipmentReservations'

export const RESERVATION_STATUS = Object.freeze({ ACTIVE: 'active', RELEASED: 'released' })

export const EQUIPMENT_RESERVED = 'equipment_reserved'
export const EQUIPMENT_RESERVATION_RELEASED = 'equipment_reservation_released'

// SPM-57: a reservation for an event in one of these statuses does not take units away from anyone.
export const NON_BLOCKING_EVENT_STATUSES = Object.freeze([REJECTED, CANCELLED, COMPLETED])

/**
 * Do two periods overlap? Equipment uses the event's own times: no venue setup or turnaround, and no
 * equipment buffer (CL1 §6, CL3 row 29). Back-to-back periods (one ends exactly when the other starts) do
 * not overlap (SPM-57).
 */
export function periodsOverlap(left, right) {
  const leftStart = Date.parse(left?.startsAt)
  const leftEnd = Date.parse(left?.endsAt)
  const rightStart = Date.parse(right?.startsAt)
  const rightEnd = Date.parse(right?.endsAt)
  if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) return false
  return leftStart < rightEnd && rightStart < leftEnd
}

/**
 * The ids of units that are not free for `period` because they are reserved for another event (SPM-57).
 * A reservation counts only while it is active, overlaps the period, belongs to a different event from
 * `ownEventId` (an event's own reservation is not subtracted when it is re-checked, SPM-18), and its event
 * is not Rejected, Cancelled or Completed. `eventStatuses` maps an event id to its status; a reservation
 * whose event status is unknown still counts, so a missing read never frees a unit.
 */
export function reservedUnitIds(reservations, period, { ownEventId = null, eventStatuses = new Map() } = {}) {
  const ids = new Set()
  for (const reservation of reservations) {
    if (reservation.status !== RESERVATION_STATUS.ACTIVE) continue
    if (ownEventId != null && reservation.eventRequestId === ownEventId) continue
    if (NON_BLOCKING_EVENT_STATUSES.includes(eventStatuses.get(reservation.eventRequestId))) continue
    if (!periodsOverlap(reservation, period)) continue
    for (const unitId of reservation.unitIds ?? []) ids.add(unitId)
  }
  return ids
}

/** Event ids whose status is needed to apply NON_BLOCKING_EVENT_STATUSES to these reservations. */
export function reservationEventIds(reservations, period) {
  return [
    ...new Set(
      reservations
        .filter((reservation) => reservation.status === RESERVATION_STATUS.ACTIVE && periodsOverlap(reservation, period))
        .map((reservation) => reservation.eventRequestId),
    ),
  ]
}

/**
 * [Team decision, 18 Oct 2026 — SPM-62, pending PO confirmation] Units are chosen automatically: for each
 * requested type, the free units (Available and not in `blockedUnitIds`) with the lowest asset tags.
 * Call only once checkRequestAvailability has found the request can be fulfilled.
 */
export function chooseUnits(items, unitsByType, blockedUnitIds = new Set()) {
  return items.map((item) => {
    const free = (unitsByType.get(item.equipmentTypeId) ?? [])
      .filter((unit) => isUsableUnit(unit) && !blockedUnitIds.has(unit.id))
      .sort((left, right) => String(left.assetTag).localeCompare(String(right.assetTag), undefined, { numeric: true }) || left.id.localeCompare(right.id))
    return {
      equipmentTypeId: item.equipmentTypeId,
      equipmentTypeName: item.equipmentTypeName ?? null,
      quantity: item.quantity,
      units: free.slice(0, item.quantity).map(({ id, assetTag }) => ({ id, assetTag })),
    }
  })
}

/** The event-level summary written on reservation: types and quantities only, never unit ids. */
export function reservedEquipmentRecord(equipmentRequestId, chosen, reservedAt) {
  return {
    equipmentRequestId,
    items: chosen.map(({ equipmentTypeId, equipmentTypeName, quantity }) => ({ equipmentTypeId, equipmentTypeName, quantity })),
    reservedAt,
  }
}

/**
 * SPM-62: the reserved equipment types and quantities, for anyone who may view the event's equipment
 * section (the Organiser shows it in place of the requested list). Individual unit ids are never included.
 */
export function reservedEquipmentSummary(user, request) {
  const reserved = request?.reservedEquipment
  if (!reserved || !Array.isArray(reserved.items) || reserved.items.length === 0) return null
  if (!viewableSectionsFor(user, request).includes(EQUIPMENT)) return null
  return {
    items: reserved.items.map(({ equipmentTypeName, quantity }) => ({ equipmentTypeName, quantity })),
    reservedAt: reserved.reservedAt ?? null,
  }
}

/** The lock document serialising reservations of one equipment type (as SPM-16's venue lock). */
export function equipmentReservationLockPath(equipmentTypeId) {
  return ['systemLocks', `equipmentReservation-${equipmentTypeId}`]
}

// --- SPM-58: viewing reservations ------------------------------------------------------------------

export const RESERVATION_STATUS_LABELS = Object.freeze({
  [RESERVATION_STATUS.ACTIVE]: 'Active',
  [RESERVATION_STATUS.RELEASED]: 'Released',
})

/**
 * [Team decision, 19 Oct 2026 — SPM-58, pending PO confirmation] A Technical Support Staff member sees the
 * reservations of events assigned to them (their SPM-42 record scope), not every event's. `event` is the
 * reservation's event record; a missing event shows nothing.
 */
export function canViewReservation(user, event) {
  return event != null && inScopeAs(TECHNICAL_STAFF, user, event)
}

/** Does a reservation still hold its units? Active, and its event not Rejected, Cancelled or Completed (SPM-57). */
export function reservationHoldsUnits(reservation, eventStatus) {
  return reservation.status === RESERVATION_STATUS.ACTIVE && !NON_BLOCKING_EVENT_STATUSES.includes(eventStatus)
}

// SPM-38: why a reservation was released, as recorded by prepareEquipmentRequestClose's closing reason.
export const RELEASE_REASON_LABELS = Object.freeze({
  event_cancelled: 'Event cancelled',
  event_rejected: 'Event rejected',
})
