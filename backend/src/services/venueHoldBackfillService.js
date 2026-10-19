import { BOOKING_PENDING } from '../../../shared/venueBooking.js'
import { AVAILABILITY_STATUS, REMOVED_STATUSES, tentativeHoldExpiresAt } from '../../../shared/venueAvailability.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

// Dry run by default. Existing deadlines are never changed; mismatches require human review.
export async function backfillVenueHoldExpiries(db = getAdminDb(), { write = false } = {}) {
  const holds = await db.collection('venueAvailability').where('status', '==', AVAILABILITY_STATUS.TENTATIVE_HOLD).get()
  const result = { planned: [], updated: [], review: [] }
  for (const snapshot of holds.docs) {
    const hold = snapshot.data()
    if (REMOVED_STATUSES.has(hold.lifecycleStatus)) continue
    const bookingRef = hold.bookingRequestId ? db.collection('venueBookingRequests').doc(hold.bookingRequestId) : null
    const booking = bookingRef ? (await bookingRef.get()).data() : null
    if (bookingRef && (!booking || booking.status !== BOOKING_PENDING || booking.holdId !== snapshot.id)) {
      result.review.push({ holdId: snapshot.id, reason: 'Linked booking is missing, changed, or no longer pending.' })
      continue
    }
    const holdExpiry = validDate(hold.holdExpiresAt)
    const bookingExpiry = validDate(booking?.holdExpiresAt)
    if (holdExpiry && bookingExpiry && holdExpiry !== bookingExpiry) {
      result.review.push({ holdId: snapshot.id, reason: 'Hold and booking deadlines differ.' })
      continue
    }
    const createdAt = validDate(hold.createdAt) ?? validDate(booking?.createdAt)
    const expiry = holdExpiry ?? bookingExpiry ?? (createdAt ? tentativeHoldExpiresAt(new Date(createdAt)) : null)
    if (!expiry) {
      result.review.push({ holdId: snapshot.id, reason: 'No usable creation time or expiry.' })
      continue
    }
    if (holdExpiry && (!bookingRef || bookingExpiry)) continue
    result.planned.push({ holdId: snapshot.id, bookingId: bookingRef?.id ?? null, holdExpiresAt: expiry })
    if (!write) continue
    const applied = await db.runTransaction(async (tx) => {
      const currentHold = (await tx.get(snapshot.ref)).data()
      const currentBooking = bookingRef ? (await tx.get(bookingRef)).data() : null
      if (!currentHold || currentHold.status !== AVAILABILITY_STATUS.TENTATIVE_HOLD || REMOVED_STATUSES.has(currentHold.lifecycleStatus) ||
        (bookingRef && (!currentBooking || currentBooking.status !== BOOKING_PENDING || currentBooking.holdId !== snapshot.id))) return false
      if (validDate(currentHold.holdExpiresAt) && validDate(currentHold.holdExpiresAt) !== expiry) return false
      if (bookingRef && validDate(currentBooking.holdExpiresAt) && validDate(currentBooking.holdExpiresAt) !== expiry) return false
      if (!validDate(currentHold.holdExpiresAt)) tx.update(snapshot.ref, { holdExpiresAt: expiry })
      if (bookingRef && !validDate(currentBooking.holdExpiresAt)) tx.update(bookingRef, { holdExpiresAt: expiry })
      return true
    })
    if (applied) result.updated.push(snapshot.id)
    else result.review.push({ holdId: snapshot.id, reason: 'Changed during backfill; retry or inspect.' })
  }
  return result
}
