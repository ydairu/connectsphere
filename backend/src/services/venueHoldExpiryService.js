import { BOOKING_EXPIRED, BOOKING_PENDING } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES } from '../../../shared/venueAvailability.js'
import { VENUE_HOLD_EXPIRED_NOTICE, VENUE_HOLD_WARNING_NOTICE, venueHoldNotifications } from '../../../shared/notifications.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { addNotifications } from './notificationService.js'

export const HOLD_WARNING_LEAD_MS = 24 * 60 * 60 * 1000

// The deadline is enforced by read and approval paths; this task records the outcome and sends notices.
// It is safe for an external scheduler to retry or overlap runs. Each hold is re-read in a transaction.
export async function processVenueHolds(db = getAdminDb(), now = null) {
  const holds = await db.collection('venueAvailability').where('status', '==', AVAILABILITY_STATUS.TENTATIVE_HOLD).get()
  const result = { warned: 0, expired: 0, skipped: 0, review: [] }

  for (const candidate of holds.docs) {
    const scanNow = now ?? new Date()
    const expiry = Date.parse(candidate.data().holdExpiresAt)
    if (REMOVED_STATUSES.has(candidate.data().lifecycleStatus) || !Number.isFinite(expiry) || scanNow.getTime() < expiry - HOLD_WARNING_LEAD_MS) {
      if (!Number.isFinite(expiry) && !REMOVED_STATUSES.has(candidate.data().lifecycleStatus)) result.review.push(candidate.id)
      else result.skipped += 1
      continue
    }
    const outcome = await db.runTransaction(async (tx) => {
      const holdRef = db.collection('venueAvailability').doc(candidate.id)
      const holdSnapshot = await tx.get(holdRef)
      const hold = holdSnapshot.data()
      if (!hold || hold.status !== AVAILABILITY_STATUS.TENTATIVE_HOLD || REMOVED_STATUSES.has(hold.lifecycleStatus)) return 'skipped'
      const deadline = Date.parse(hold.holdExpiresAt)
      if (!Number.isFinite(deadline)) return 'review'

      // Standalone legacy holds have no booking or Coordinator. They still stop occupying the venue.
      const bookingRef = hold.bookingRequestId ? db.collection('venueBookingRequests').doc(hold.bookingRequestId) : null
      const bookingSnapshot = bookingRef ? await tx.get(bookingRef) : null
      const booking = bookingSnapshot?.data()
      if (bookingRef && (!booking || booking.holdId !== candidate.id || booking.eventRequestId !== hold.eventRequestId || booking.venueId !== hold.venueId)) return 'review'
      if (booking && booking.status !== BOOKING_PENDING) return 'skipped'
      const eventRef = hold.eventRequestId ? db.collection('eventRequests').doc(hold.eventRequestId) : null
      const eventSnapshot = booking && eventRef ? await tx.get(eventRef) : null
      const event = eventSnapshot?.data()
      if (booking && !event) return 'review'
      if (booking && !event.assignedCoordinatorUid) return 'review'
      const processNow = now ?? new Date()
      const expiring = processNow.getTime() >= deadline
      if (!expiring && processNow.getTime() < deadline - HOLD_WARNING_LEAD_MS) return 'skipped'
      const at = processNow.toISOString()
      if (expiring) {
        const allocationRef = booking ? db.collection('systemLocks').doc('venueStaffAssignment') : null
        const allocation = allocationRef ? await tx.get(allocationRef) : null
        tx.update(holdRef, { lifecycleStatus: 'removed', removedAt: at, removalReason: 'expired' })
        if (booking) {
          tx.update(bookingRef, { status: BOOKING_EXPIRED, expiredAt: at, updatedAt: at })
          if (allocationRef) tx.set(allocationRef, { ...allocation.data(), updatedAt: at })
          tx.set(eventRef.collection('activity').doc(), { type: 'venue_hold_expired', bookingRequestId: bookingRef.id,
            actor: { type: 'system', name: 'System' }, at })
          addNotifications(tx, db, venueHoldNotifications({ ...event, id: eventRef.id }, { ...booking, id: bookingRef.id }, VENUE_HOLD_EXPIRED_NOTICE, at))
        }
        return 'expired'
      }
      if (!booking || booking.warningSentAt) return 'skipped'
      tx.update(bookingRef, { warningSentAt: at })
      addNotifications(tx, db, venueHoldNotifications({ ...event, id: eventRef.id }, { ...booking, id: bookingRef.id }, VENUE_HOLD_WARNING_NOTICE, at))
      return 'warned'
    })
    if (outcome === 'review') result.review.push(candidate.id)
    else result[outcome] += 1
  }
  return result
}
