// SPM-92 — record the Safety Officer's review of an event; SPM-66 — the booked venues' safety details.
//
// Who may review, what a valid review is and what it writes are decided only by shared/safetyReview.js. This
// file reads the event, asks it, and writes the review, its activity entry and the Coordinator's notice in one
// transaction, so the state that was checked is the state that is changed. Submitting for review is an event
// action (statusTransitionService.js), not a route here.

import { safetyReviewDecidedNotifications } from '../../../shared/notifications.js'
import {
  canDecideSafetyReview,
  canViewSafetyVenueDetails,
  normaliseSafetyReviewDecision,
  safetyReviewDecisionUpdate,
} from '../../../shared/safetyReview.js'
import { BOOKING_APPROVED, capacityWarning, currentVenueBookingGroups, effectiveVenueBookingStatus } from '../../../shared/venueBooking.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION } from './coordinatorAssignmentService.js'
import { EventRequestForbiddenError, EventRequestNotFoundError, EventRequestValidationError } from './eventRequestService.js'
import { addNotifications } from './notificationService.js'
import { userActor } from './statusHistory.js'
import { StatusTransitionError, requireRequestScope } from './statusTransitionService.js'
import { BOOKINGS } from './venueBookingService.js'

// Activity entry types beside statusTransitionService.js's SAFETY_REVIEW_SUBMITTED.
export const SAFETY_REVIEW_DECIDED = 'safety_review_decided'

/**
 * Records the review `input` ({ outcome, checklist, comments?, internalNotes? }) on event `id` as `user`, and
 * returns the updated event (unprojected). Out of scope: EventRequestNotFoundError for a Coordinator, otherwise
 * EventRequestForbiddenError — a Safety Officer cannot reach an event outside the queue. Not a Safety Officer,
 * or the event is no longer awaiting review: StatusTransitionError. An invalid review: EventRequestValidationError,
 * checked after authorisation so a refusal is never a 400. Nothing is written when any check fails.
 */
export async function decideSafetyReview(id, input, user, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const docRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const existing = { id, ...snapshot.data() }
    requireRequestScope(user, existing)

    const decision = canDecideSafetyReview(user, existing)
    if (!decision.allowed) throw new StatusTransitionError(decision.reason)
    const { value, errors } = normaliseSafetyReviewDecision(input)
    if (Object.keys(errors).length > 0) throw new EventRequestValidationError(errors)

    const at = now.toISOString()
    const update = { ...safetyReviewDecisionUpdate(user, existing, value, at), updatedAt: at }
    tx.set(docRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
      type: SAFETY_REVIEW_DECIDED,
      outcome: value.outcome,
      actor: userActor(user),
      at,
    })
    // SPM-92 AC4–AC6: the assigned Coordinator is told the outcome, with the comments for changes or rejection.
    addNotifications(tx, db, safetyReviewDecidedNotifications(existing, user, { outcome: value.outcome, comments: value.comments, at }))
    tx.update(docRef, update)
    return { ...existing, ...update }
  })
}

// What the review needs to know about each booked venue (SPM-66 AC2): its capacity, the layouts and
// accessibility features it supports, and its operating hours. The venue record has no separate restrictions
// field; operating hours are the only recorded restriction.
function presentVenue(booking, venue) {
  return {
    bookingRequestId: booking.id,
    venueName: booking.venueName ?? venue?.name ?? null,
    startsAt: booking.startsAt ?? null,
    endsAt: booking.endsAt ?? null,
    attendeeCount: booking.attendeeCount ?? null,
    requirements: booking.requirements ?? '',
    specialRequests: booking.specialRequests ?? '',
    maximumCapacity: venue?.maximumCapacity ?? null,
    supportedLayouts: venue?.supportedLayouts ?? [],
    accessibilityFeatures: venue?.accessibilityFeatures ?? [],
    facilities: venue?.facilities ?? [],
    operatingHours: venue?.operatingHours ?? null,
    capacityWarning: venue ? capacityWarning(booking.attendeeCount, venue.maximumCapacity) : null,
    venueMissing: !venue,
  }
}

/**
 * The event's approved venue bookings with each venue's safety details, for the assigned Coordinator and an
 * in-scope Safety Officer: { venues: [...] }. Everyone else is refused as reading the event would refuse them.
 */
export async function listSafetyVenueDetails(id, user, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const event = { id, ...snapshot.data() }
  requireRequestScope(user, event)
  if (!canViewSafetyVenueDetails(user, event)) throw new EventRequestForbiddenError()

  const bookings = (await db.collection(BOOKINGS).where('eventRequestId', '==', id).get()).docs.map((doc) => ({ ...doc.data(), id: doc.id }))
  const approved = currentVenueBookingGroups(bookings)
    .map((group) => group.current)
    .filter((booking) => effectiveVenueBookingStatus(booking, now) === BOOKING_APPROVED)
  const venues = await Promise.all(approved.map(async (booking) => {
    const venue = booking.venueId ? await db.collection('venues').doc(booking.venueId).get() : null
    return presentVenue(booking, venue?.exists ? venue.data() : null)
  }))
  return { venues }
}
