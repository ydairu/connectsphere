// SPM-57 / SPM-62 — reading and releasing equipment reservations. Rules are in shared/equipmentReservation.js.
// Reserving itself is an action on the equipment request (decideEquipmentRequest in equipmentRequestService.js),
// so it runs in the same transaction pattern as SPM-56's approval.

import {
  EQUIPMENT_RESERVATIONS_COLLECTION,
  EQUIPMENT_RESERVATION_RELEASED,
  RESERVATION_STATUS,
  reservationEventIds,
  reservedUnitIds,
} from '../../../shared/equipmentReservation.js'

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
