// SPM-91/92 — an event's safety review as recorded on the request: the constants and the reads, with no
// imports beyond status.js.
//
// Split out of shared/safetyReview.js so shared/permissions.js (the Safety Officer's record scope, SPM-66) and
// shared/statusTransitions.js (the Confirm and Start Preparation guards) can read the review without a
// circular import: safetyReview.js imports permissions.js.
//
// The current review is record metadata, stored at the top level and never inside a section, so no section
// edit can write it:
//   safetyReview: { status, submittedAt, submittedByUid, decidedAt?, outcome?, invalidatedAt?, invalidatedReason? }
//   safetyReviews: [{ reviewerUid, reviewerName, reviewedAt, submittedAt, outcome, checklist, comments, internalNotes }]
// `safetyReviews` keeps every recorded review, oldest first; a resubmission never removes one.

import { CONFIRMED, PLANNING } from './status.js'

// "On submission, the event enters the safety-review queue and displays 'Pending safety check'" — SPM-91.
export const SAFETY_REVIEW_PENDING = 'pending'
// The three outcomes of SPM-92: approve, request changes, reject the safety arrangement.
export const SAFETY_APPROVED = 'approved'
export const SAFETY_CHANGES_REQUESTED = 'changes_requested'
export const SAFETY_REJECTED = 'rejected'
// SPM-91: "When an accepted significant change returns a safety-approved event to Planning, its safety
// approval is invalidated and another safety check is required."
export const SAFETY_INVALIDATED = 'invalidated'

export const SAFETY_REVIEW_STATUSES = Object.freeze([
  SAFETY_REVIEW_PENDING,
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_REJECTED,
  SAFETY_INVALIDATED,
])

/** The current safety review status, or null when the event has never been submitted for one. */
export function safetyReviewStatus(request) {
  const status = request?.safetyReview?.status
  return SAFETY_REVIEW_STATUSES.includes(status) ? status : null
}

// Statuses at which a pending review is in the queue. The review happens before Confirmed (CL3 G8!C2, C3);
// Confirmed is here only for events confirmed before SPM-91 existed (canSubmitForSafetyReview). A closed event
// leaves the queue with its status.
const QUEUE_STATUSES = Object.freeze([PLANNING, CONFIRMED])

/** Is the event in the safety-review queue? */
export function awaitingSafetyReview(request) {
  return QUEUE_STATUSES.includes(request?.status) && safetyReviewStatus(request) === SAFETY_REVIEW_PENDING
}

/**
 * The status to show for the review: as stored, except that a pending review on an event that has left the
 * queue (it was cancelled or rejected while waiting) is not shown at all.
 */
export function shownSafetyReviewStatus(request) {
  const status = safetyReviewStatus(request)
  return status === SAFETY_REVIEW_PENDING && !awaitingSafetyReview(request) ? null : status
}

/** Does the event hold a valid safety approval? SPM-91: "cannot become Confirmed without a valid safety approval." */
export function safetyApproved(request) {
  return safetyReviewStatus(request) === SAFETY_APPROVED
}

// Why a review was withdrawn: the reviewed arrangements changed.
export const INVALIDATED_BY_SIGNIFICANT_CHANGE = 'significant_change'
export const INVALIDATED_BY_VENUE_BOOKING_CANCELLED = 'venue_booking_cancelled'
export const INVALIDATED_BY_VENUE_BOOKING_REQUESTED = 'venue_booking_requested'
export const INVALIDATED_BY_EQUIPMENT_REQUESTED = 'equipment_requested'
export const INVALIDATED_BY_TECHNICAL_REJECTED = 'technical_rejected'

// Reviews a change to the arrangements withdraws.
const INVALIDATED_STATUSES = Object.freeze([SAFETY_APPROVED, SAFETY_REVIEW_PENDING, SAFETY_REJECTED])

/**
 * The `safetyReview` metadata to write when the reviewed arrangements change, or null when there is nothing
 * to withdraw. Every path that changes them calls this: a significant change, a venue booking requested or
 * cancelled, an equipment request submitted, a technical sign-off rejected.
 * - An approval is invalidated (SPM-91 AC6).
 * - [Team decision pending — SPM-91] A pending review leaves the queue, because the Safety Officer would
 *   otherwise review arrangements that no longer apply.
 * - [Team decision pending — SPM-92] A rejected arrangement counts as revised, so it may be resubmitted
 *   (CL3 G8!C47: "revised arrangements and another safety review are allowed").
 * Changes requested are left as they are: the Coordinator may resubmit them at any time.
 */
export function safetyReviewInvalidation(request, reason, at) {
  if (!INVALIDATED_STATUSES.includes(safetyReviewStatus(request))) return null
  return { ...request.safetyReview, status: SAFETY_INVALIDATED, invalidatedAt: at, invalidatedReason: reason }
}
