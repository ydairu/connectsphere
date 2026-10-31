// SPM-87 — after a significant change, the Coordinator decides which venue and technical sign-offs need
// re-approval.
//
// Pure functions: no Firebase, no I/O. A significant change saved through PATCH /api/requests/:id marks the
// recorded sign-offs "Changed since approval" (signOffReviewOnChange, applied by shared/significantChanges.js);
// the Coordinator's choice is applied by POST /api/requests/:id/sign-off-review
// (backend/src/services/signOffReviewService.js). Both decisions are made here.
//
// "There is no automatic reset of any venue/equipment arrangement on a change; the Coordinator reviews and
// decides the next action." — CL3 G8!C51 (effective-requirements.md §4.7). This replaces SPM-10's automatic
// clearing of the sign-offs.
//
// The review is record metadata, stored at the top level so no section edit can write it:
//   signOffReview: { status: 'pending' | 'decided', changedAt, changedFields: string[],
//                    items: [{ key, kind: 'venue' | 'technical', label, bookingId? }],
//                    reapprove?: string[], decidedAt?, decidedByUid? }
// A venue booking sent back carries `reapprovalRequestedAt` (shared/venueBooking.js, awaitingReapproval); a
// technical sign-off sent back is removed from `arrangementApprovals`, so it reads Awaiting approval.

import { ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT, arrangementDecision } from './arrangementDecisions.js'
import { NOT_PERMITTED, isAssignedCoordinator } from './requestActors.js'
import { CONFIRMED, PLANNING, PREPARATION } from './status.js'
import { BOOKING_APPROVED, awaitingReapproval, currentVenueBookingGroups, effectiveVenueBookingStatus } from './venueBooking.js'

export { NOT_PERMITTED }

export const SIGN_OFF_REVIEW_PENDING = 'pending'
export const SIGN_OFF_REVIEW_DECIDED = 'decided'

export const VENUE_SIGN_OFF = 'venue'
export const TECHNICAL_SIGN_OFF = 'technical'
export const TECHNICAL_SIGN_OFF_KEY = 'technical'
export const venueSignOffKey = (bookingId) => `venue:${bookingId}`

// The change history field that records the Coordinator's choice (AC5), in the shape SPM-90 uses for the
// primary venue: a field_changed entry whose field is not a section, so only the assigned Coordinator sees it.
export const SIGN_OFF_REVIEW_FIELD = 'signOffReapproval'

// Reasons a request is refused.
export const NO_SIGN_OFF_REVIEW = 'no_sign_off_review'
// Refused because the Coordinator has not yet chosen which changed sign-offs go back.
export const SIGN_OFF_REVIEW_UNDECIDED = 'sign_off_review_pending'

// Statuses at which a significant change marks the sign-offs (AC1). Confirmed and Preparation then move back
// to Planning (shared/significantChanges.js).
export const MARKING_STATUSES = Object.freeze([PLANNING, CONFIRMED, PREPARATION])

/** Has a significant change marked sign-offs that the Coordinator has not yet decided on? */
export function signOffReviewPending(event) {
  return event?.signOffReview?.status === SIGN_OFF_REVIEW_PENDING
}

/**
 * The sign-offs recorded on the event now, as review items: each current venue booking that is approved (and
 * not already sent back), and the technical sign-off when it is approved. `bookings` are the event's
 * venueBookingRequests documents with their ids.
 */
export function recordedSignOffs(event, bookings = [], now = new Date()) {
  const venues = currentVenueBookingGroups(bookings)
    .map((group) => group.current)
    .filter((booking) => effectiveVenueBookingStatus(booking, now) === BOOKING_APPROVED && !awaitingReapproval(booking))
    .map((booking) => ({ key: venueSignOffKey(booking.id), kind: VENUE_SIGN_OFF, label: booking.venueName ?? 'Venue booking', bookingId: booking.id }))
  const technical = arrangementDecision(event, TECHNICAL_ARRANGEMENT) === ARRANGEMENT_APPROVED
    ? [{ key: TECHNICAL_SIGN_OFF_KEY, kind: TECHNICAL_SIGN_OFF, label: 'Technical arrangement' }]
    : []
  return [...venues, ...technical]
}

/**
 * The `signOffReview` to write when a significant change to `fields` is saved on `before`, or null when there
 * is nothing to mark. AC1: "the sign-offs are kept and marked 'Changed since approval'". A second change before
 * the Coordinator decides adds to the same pending review rather than replacing it.
 */
export function signOffReviewOnChange(before, bookings, { fields = [], at = null, now = new Date() } = {}) {
  if (!MARKING_STATUSES.includes(before?.status)) return null
  const pending = signOffReviewPending(before) ? before.signOffReview : null
  const items = [...(pending?.items ?? [])]
  for (const item of recordedSignOffs(before, bookings, now)) {
    if (!items.some((existing) => existing.key === item.key)) items.push(item)
  }
  if (items.length === 0) return null
  return {
    status: SIGN_OFF_REVIEW_PENDING,
    changedAt: at,
    changedFields: [...new Set([...(pending?.changedFields ?? []), ...fields])],
    items,
  }
}

/**
 * May this user record the choice now? Only the assigned Coordinator, while the event is in Planning (a change
 * to a Confirmed or Preparation event has already moved it back) and the review is pending.
 */
export function canDecideSignOffReview(user, event) {
  if (!isAssignedCoordinator(user, event)) return { allowed: false, reason: NOT_PERMITTED }
  if (event.status !== PLANNING || !signOffReviewPending(event)) return { allowed: false, reason: NO_SIGN_OFF_REVIEW }
  return { allowed: true }
}

/**
 * Validates the Coordinator's choice { reapprove: [itemKey, ...] } against the pending review. An empty list is
 * the explicit "none require re-approval" of AC6. Returns { value: keys, errors }.
 */
export function normaliseSignOffChoice(input, review) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { value: null, errors: { request: 'Choose which sign-offs to send back.' } }
  const errors = {}
  for (const key of Object.keys(input)) if (key !== 'reapprove') errors[key] = 'This field cannot be set.'
  const keys = input.reapprove
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    errors.reapprove = 'Send a list of the sign-offs to send back, or an empty list if none need re-approval.'
    return { value: null, errors }
  }
  const known = new Set((review?.items ?? []).map((item) => item.key))
  const unknown = keys.filter((key) => !known.has(key))
  if (unknown.length > 0) errors.reapprove = `Not a sign-off changed since approval: ${unknown.join(', ')}.`
  return { value: [...new Set(keys)], errors }
}

/**
 * What the choice writes: the decided review, the venue bookings to send back and whether the technical
 * sign-off goes back. AC2: "only those return to Awaiting approval"; AC6: the rest stay valid.
 */
export function signOffReviewDecision(user, event, keys, at) {
  const items = event.signOffReview.items
  const chosen = items.filter((item) => keys.includes(item.key))
  return {
    signOffReview: { ...event.signOffReview, status: SIGN_OFF_REVIEW_DECIDED, reapprove: chosen.map((item) => item.key), decidedAt: at, decidedByUid: user.uid },
    bookingIds: chosen.filter((item) => item.kind === VENUE_SIGN_OFF).map((item) => item.bookingId),
    technical: chosen.some((item) => item.kind === TECHNICAL_SIGN_OFF),
    historyValues: {
      oldValue: items.map((item) => item.label),
      newValue: chosen.length > 0 ? chosen.map((item) => item.label) : 'None (existing approvals kept)',
    },
  }
}

/** The review as the page shows it, for the assigned Coordinator only; null for everyone else or when there is none. */
export function signOffReviewSummary(user, event) {
  const review = event?.signOffReview
  if (!review || !isAssignedCoordinator(user, event)) return null
  return {
    status: review.status,
    changedAt: review.changedAt ?? null,
    changedFields: review.changedFields ?? [],
    items: (review.items ?? []).map(({ key, kind, label }) => ({ key, kind, label })),
    reapprove: review.reapprove ?? null,
    decidedAt: review.decidedAt ?? null,
  }
}
