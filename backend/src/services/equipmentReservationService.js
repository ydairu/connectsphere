// SPM-57 / SPM-62 — reading and releasing equipment reservations. Rules are in shared/equipmentReservation.js.
// Reserving itself is an action on the equipment request (decideEquipmentRequest in equipmentRequestService.js),
// so it runs in the same transaction pattern as SPM-56's approval.

import {
  EQUIPMENT_RESERVATIONS_COLLECTION,
  EQUIPMENT_RESERVATION_RELEASED,
  RESERVATION_STATUS,
  canViewReservation,
  reservationEventIds,
  reservationHoldsUnits,
  reservedUnitIds,
} from '../../../shared/equipmentReservation.js'
import { inScope } from '../../../shared/permissions.js'

export class ReservationQueryError extends Error {
  constructor(errors) {
    super('Invalid reservation query.')
    this.name = 'ReservationQueryError'
    this.errors = errors
  }
}

/**
 * The ids of units reserved for other events whose period overlaps `period` (SPM-57), for these equipment
 * types. `read` runs a query or document read, so a transaction can pass (ref) => tx.get(ref). The events of
 * overlapping reservations are read to leave out Rejected, Cancelled and Completed ones.
 */
export async function loadReservedUnitIds(db, typeIds, period, { ownEventId = null, read = (ref) => ref.get() } = {}) {
  if (!period?.startsAt || !period?.endsAt) return new Set()
  const ids = [...new Set(typeIds)]
  const snapshots = await Promise.all(ids.map((typeId) => read(db.collection(EQUIPMENT_RESERVATIONS_COLLECTION).where('equipmentTypeId', '==', typeId))))
  const reservations = snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))

  const eventIds = reservationEventIds(reservations, period).filter((id) => id !== ownEventId)
  const events = await Promise.all(eventIds.map((id) => read(db.collection('eventRequests').doc(id))))
  const eventStatuses = new Map(events.map((snapshot, index) => [eventIds[index], snapshot.exists ? snapshot.data().status : undefined]))

  return reservedUnitIds(reservations, period, { ownEventId, eventStatuses })
}

/**
 * SPM-62 (team decision 2a, 18 Oct 2026): when the whole event is rejected or cancelled, its active
 * reservations are released in the same transaction (CL1 §8: cancellation frees committed reservations).
 * Reads only; returns the write phase, to run after every read in the transaction.
 */
export async function prepareReservationRelease(tx, db, eventId, user, now, releasedReason) {
  const active = (await tx.get(db.collection(EQUIPMENT_RESERVATIONS_COLLECTION).where('eventRequestId', '==', eventId))).docs
    .filter((doc) => doc.data().status === RESERVATION_STATUS.ACTIVE)
  return () => {
    if (!active.length) return {}
    const at = now.toISOString()
    for (const doc of active) {
      tx.update(doc.ref, { status: RESERVATION_STATUS.RELEASED, releasedReason, releasedByUid: user.uid, releasedAt: at })
    }
    tx.set(db.collection('eventRequests').doc(eventId).collection('activity').doc(), {
      type: EQUIPMENT_RESERVATION_RELEASED,
      reservationIds: active.map((doc) => doc.id),
      reason: releasedReason,
      actor: { type: 'user', uid: user.uid, name: user.name ?? null },
      at,
    })
    return { reservedEquipment: null }
  }
}

// --- SPM-58: viewing reservations --------------------------------------------------------------------

const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

async function loadEvents(db, ids) {
  const unique = [...new Set(ids)]
  const snapshots = await Promise.all(unique.map((id) => db.collection('eventRequests').doc(id).get()))
  return new Map(unique.map((id, index) => [id, snapshots[index].exists ? { ...snapshots[index].data(), id } : null]))
}

/**
 * SPM-58 — the reservations of the events this Technical Support Staff member is assigned to, with each
 * one's event name and date/time, equipment type, quantity, the reserved asset tags, status, and when it was
 * reserved and (if so) released. `query.status` may be 'active' or 'released'. Active first, then by start.
 */
export async function listVisibleReservations(user, query = {}, db) {
  const status = query.status
  if (status !== undefined && !Object.values(RESERVATION_STATUS).includes(status)) {
    throw new ReservationQueryError({ status: 'Choose active or released.' })
  }
  const base = db.collection(EQUIPMENT_RESERVATIONS_COLLECTION)
  const reservations = rows(await (status ? base.where('status', '==', status) : base).get())
  const events = await loadEvents(db, reservations.map((reservation) => reservation.eventRequestId))
  const visible = reservations.filter((reservation) => canViewReservation(user, events.get(reservation.eventRequestId)))

  const unitIds = [...new Set(visible.flatMap((reservation) => reservation.unitIds ?? []))]
  const unitSnapshots = await Promise.all(unitIds.map((id) => db.collection('equipmentUnits').doc(id).get()))
  const assetTags = new Map(unitIds.map((id, index) => [id, unitSnapshots[index].exists ? unitSnapshots[index].data().assetTag : null]))

  const activeFirst = (reservation) => (reservation.status === RESERVATION_STATUS.ACTIVE ? 0 : 1)
  return {
    reservations: visible
      .sort((a, b) => activeFirst(a) - activeFirst(b) || String(a.startsAt).localeCompare(String(b.startsAt)) || a.id.localeCompare(b.id))
      .map((reservation) => {
        const event = events.get(reservation.eventRequestId)
        return {
          id: reservation.id,
          eventRequestId: reservation.eventRequestId,
          eventTitle: event.core?.title ?? null,
          eventStatus: event.status,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          equipmentTypeId: reservation.equipmentTypeId,
          equipmentTypeName: reservation.equipmentTypeName ?? null,
          quantity: reservation.quantity,
          assetTags: (reservation.unitIds ?? []).map((id) => assetTags.get(id)).filter(Boolean),
          status: reservation.status,
          reservedAt: reservation.reservedAt ?? null,
          reservedByName: reservation.reservedByName ?? null,
          releasedAt: reservation.releasedAt ?? null,
          releasedReason: reservation.releasedReason ?? null,
        }
      }),
  }
}

/**
 * SPM-58 — for each unit of an equipment type, the reservations that still hold it (active, and the event not
 * Rejected, Cancelled or Completed), soonest first. The event is named only to a viewer who may see that event
 * (their record scope); otherwise it is shown as another event, with its date and time only.
 */
export async function loadUnitReservations(user, equipmentTypeId, db) {
  const reservations = rows(await db.collection(EQUIPMENT_RESERVATIONS_COLLECTION).where('equipmentTypeId', '==', equipmentTypeId).get())
    .filter((reservation) => reservation.status === RESERVATION_STATUS.ACTIVE)
  const events = await loadEvents(db, reservations.map((reservation) => reservation.eventRequestId))
  const byUnit = new Map()
  for (const reservation of reservations) {
    const event = events.get(reservation.eventRequestId)
    if (!reservationHoldsUnits(reservation, event?.status)) continue
    const visible = event != null && inScope(user, event)
    const entry = {
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      reservedAt: reservation.reservedAt ?? null,
      eventRequestId: visible ? reservation.eventRequestId : null,
      eventTitle: visible ? event.core?.title ?? null : null,
    }
    for (const unitId of reservation.unitIds ?? []) {
      if (!byUnit.has(unitId)) byUnit.set(unitId, [])
      byUnit.get(unitId).push(entry)
    }
  }
  for (const entries of byUnit.values()) entries.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
  return byUnit
}
