// SPM-91 / SPM-92 — submitting an event for its Operational Safety Check, and recording the Safety Officer's
// review.
//
// Pure functions: no Firebase, no I/O. The backend applies a submission or a decision inside a transaction
// (backend/src/services/statusTransitionService.js, backend/src/services/safetyReviewService.js) and re-checks
// with canSubmitForSafetyReview() / canDecideSafetyReview(); the frontend uses them only to decide what to show.
//
// Sources: W7-CUST Change #6; CL3 G8!C2, C3, C17, C45–C47, C49 (effective-requirements.md §4.6.1); the SPM-91
// and SPM-92 acceptance criteria. Rules marked [Team decision pending] are choices the sources left open.
//
// The review is record metadata (shared/safetyReviewState.js). It never changes the lifecycle status: the
// event stays in Planning while it is pending, after changes are requested and after a rejection.

import { arrangementsApproved } from './arrangements.js'
import { SAFETY_OFFICER, inScopeAs, rolesOf } from './permissions.js'
import { NOT_PERMITTED, isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import {
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_REJECTED,
  SAFETY_REVIEW_PENDING,
  awaitingSafetyReview,
  safetyReviewStatus,
  shownSafetyReviewStatus,
} from './safetyReviewState.js'
import { CONFIRMED, PLANNING } from './status.js'

export * from './safetyReviewState.js'
export { NOT_PERMITTED }

// --- Actions --------------------------------------------------------------------------------------

// The Coordinator's action, sent to POST /api/event-requests/:id/transitions like every other event action.
// The same action resubmits after changes were requested, the arrangement was rejected or an approval was
// invalidated (SPM-91 AC5).
export const SUBMIT_SAFETY_REVIEW = 'submit_safety_review'

// The Safety Officer's outcomes (SPM-92 AC3), sent to POST /api/requests/:id/safety-review.
export const APPROVE_SAFETY = 'approve'
export const REQUEST_SAFETY_CHANGES = 'request_changes'
export const REJECT_SAFETY_ARRANGEMENT = 'reject'
export const SAFETY_OUTCOMES = Object.freeze([APPROVE_SAFETY, REQUEST_SAFETY_CHANGES, REJECT_SAFETY_ARRANGEMENT])

// The review status each outcome records.
export const OUTCOME_STATUS = Object.freeze({
  [APPROVE_SAFETY]: SAFETY_APPROVED,
  [REQUEST_SAFETY_CHANGES]: SAFETY_CHANGES_REQUESTED,
  [REJECT_SAFETY_ARRANGEMENT]: SAFETY_REJECTED,
})

// --- Reasons an action is refused -----------------------------------------------------------------

export const SAFETY_NOT_AT_PLANNING = 'safety_review_not_at_planning'
export const ARRANGEMENTS_NOT_READY = 'arrangements_not_ready'
export const SAFETY_REVIEW_ALREADY_PENDING = 'safety_review_already_pending'
export const SAFETY_ALREADY_APPROVED = 'safety_already_approved'
export const SAFETY_ARRANGEMENT_NOT_REVISED = 'safety_arrangement_not_revised'
export const NOT_AWAITING_SAFETY_REVIEW = 'not_awaiting_safety_review'

// --- Submission (SPM-91) --------------------------------------------------------------------------

/**
 * May this user submit (or resubmit) the event for safety review now? `request` must carry the current
 * `venueBookingReadiness`, as SPM-9's Confirm guard does. Returns { allowed: true } or { allowed: false, reason }.
 *
 * - "Only the assigned Coordinator can submit an event in Planning for safety review." (AC1)
 * - "Submission is permitted only when all required venue bookings and technical arrangements are approved."
 *   (AC2) — the same check as Confirm, arrangementsApproved() in shared/arrangements.js.
 * - "Following revisions, the Coordinator can resubmit the event once the readiness conditions are satisfied."
 *   (AC5) — refused while a review is pending or an approval is still valid, and after a rejection until the
 *   arrangement is revised (safetyReviewInvalidation turns the rejection into `invalidated`).
 * - [Team decision pending — SPM-91] A Confirmed event with no review at all was confirmed before SPM-91 and
 *   may be submitted, so it can reach Preparation; it is never sent back to Planning.
 */
export function canSubmitForSafetyReview(user, request) {
  const status = safetyReviewStatus(request)
  const legacyConfirmed = request.status === CONFIRMED && status === null
  if (request.status !== PLANNING && !legacyConfirmed) return { allowed: false, reason: SAFETY_NOT_AT_PLANNING }
  if (!isAssignedCoordinator(user, request)) return { allowed: false, reason: NOT_PERMITTED }
  if (status === SAFETY_REVIEW_PENDING) return { allowed: false, reason: SAFETY_REVIEW_ALREADY_PENDING }
  if (status === SAFETY_APPROVED) return { allowed: false, reason: SAFETY_ALREADY_APPROVED }
  if (status === SAFETY_REJECTED) return { allowed: false, reason: SAFETY_ARRANGEMENT_NOT_REVISED }
  if (!arrangementsApproved(request)) return { allowed: false, reason: ARRANGEMENTS_NOT_READY }
  return { allowed: true }
}

/** The `safetyReview` metadata written by a submission. Earlier reviews stay in `safetyReviews`. */
export function safetyReviewSubmission(user, at) {
  return { status: SAFETY_REVIEW_PENDING, submittedAt: at, submittedByUid: user.uid }
}

// --- Review (SPM-92) ------------------------------------------------------------------------------

/**
 * May this user record the review now? A Safety Officer, on an event in the safety-review queue — the review
 * scope SPM-66 defines (shared/permissions.js). Any authorised Safety Officer may pick up a queued event:
 * CL3 G8!C49 allows routing "through a safety-review queue". [Team decision pending — SPM-66] There is no
 * claim or assignment step.
 */
export function canDecideSafetyReview(user, request) {
  if (!rolesOf(user).includes(SAFETY_OFFICER)) return { allowed: false, reason: NOT_PERMITTED }
  if (!awaitingSafetyReview(request)) return { allowed: false, reason: NOT_AWAITING_SAFETY_REVIEW }
  return { allowed: true }
}

// "The checklist covers attendance versus capacity, layout, emergency access, accessibility, equipment
// placement and venue restrictions, with comments for each item." — SPM-92 AC2; CL3 G8!C17.
export const SAFETY_CHECKLIST_ITEMS = Object.freeze([
  { id: 'attendanceCapacity', label: 'Attendance versus capacity' },
  { id: 'layout', label: 'Layout' },
  { id: 'emergencyAccess', label: 'Emergency access' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'equipmentPlacement', label: 'Equipment placement' },
  { id: 'venueRestrictions', label: 'Venue restrictions' },
])
export const SAFETY_CHECKLIST_IDS = Object.freeze(SAFETY_CHECKLIST_ITEMS.map((item) => item.id))

// [Team decision pending — SPM-92] The customer named the checklist items but not how each is marked.
export const CHECK_SATISFACTORY = 'satisfactory'
export const CHECK_CONCERN = 'concern'
export const CHECK_NOT_APPLICABLE = 'not_applicable'
export const CHECK_RESULTS = Object.freeze([CHECK_SATISFACTORY, CHECK_CONCERN, CHECK_NOT_APPLICABLE])

// [Team decision pending — SPM-92] The customer set no limits; these match the other free-text fields.
export const MAX_ITEM_COMMENT_LENGTH = 1000
export const MAX_SAFETY_COMMENT_LENGTH = 2000

const DECISION_KEYS = Object.freeze(['outcome', 'checklist', 'comments', 'internalNotes'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalText(value, max, path, errors) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors[path] = 'Must be text.'
    return ''
  }
  const text = value.trim()
  if (text.length > max) errors[path] = `Must be ${max} characters or fewer.`
  return text
}

/**
 * Validates a review body { outcome, checklist: { [itemId]: { result, comment? } }, comments?, internalNotes? }.
 * Returns { value, errors }; `errors` is keyed by field path and is empty when the body is valid.
 *
 * - Exactly one outcome: approve, request changes, or reject the safety arrangement (AC3).
 * - Every checklist item has a result; a comment may be given for each (AC2).
 * - "Comments are required for Request changes and Reject." (AC3) `comments` is what the Coordinator and the
 *   Organiser read (AC7); `internalNotes` are private and never reach the Organiser.
 */
export function normaliseSafetyReviewDecision(input) {
  if (!isPlainObject(input)) return { value: null, errors: { request: 'Expected a safety review object.' } }
  const errors = {}
  for (const key of Object.keys(input)) if (!DECISION_KEYS.includes(key)) errors[key] = 'This field cannot be set.'

  const outcome = input.outcome
  if (!SAFETY_OUTCOMES.includes(outcome)) errors.outcome = 'Choose Approve, Request changes or Reject safety arrangement.'

  const checklist = {}
  if (!isPlainObject(input.checklist)) {
    errors.checklist = 'Complete every checklist item.'
  } else {
    for (const key of Object.keys(input.checklist)) {
      if (!SAFETY_CHECKLIST_IDS.includes(key)) errors[`checklist.${key}`] = 'Unknown checklist item.'
    }
    for (const id of SAFETY_CHECKLIST_IDS) {
      const item = input.checklist[id]
      if (!isPlainObject(item) || !CHECK_RESULTS.includes(item.result)) {
        errors[`checklist.${id}`] = 'Choose a result for this item.'
        continue
      }
      for (const key of Object.keys(item)) {
        if (key !== 'result' && key !== 'comment') errors[`checklist.${id}.${key}`] = 'This field cannot be set.'
      }
      checklist[id] = { result: item.result, comment: optionalText(item.comment, MAX_ITEM_COMMENT_LENGTH, `checklist.${id}.comment`, errors) }
    }
  }

  const comments = optionalText(input.comments, MAX_SAFETY_COMMENT_LENGTH, 'comments', errors)
  if (!errors.comments && comments === '' && (outcome === REQUEST_SAFETY_CHANGES || outcome === REJECT_SAFETY_ARRANGEMENT)) {
    errors.comments = 'Comments are required when requesting changes or rejecting the safety arrangement.'
  }
  const internalNotes = optionalText(input.internalNotes, MAX_SAFETY_COMMENT_LENGTH, 'internalNotes', errors)

  return { value: { outcome, checklist, comments, internalNotes }, errors }
}

/**
 * What a recorded review writes: the new `safetyReview` metadata and the review appended to `safetyReviews`.
 * "Each review records the reviewer, date/time, checklist results, outcome and comments." (AC8)
 * Nothing else changes: the status stays Planning and the venue and technical sign-offs are preserved
 * (AC5, AC6; CL3 G8!C46, C47).
 */
export function safetyReviewDecisionUpdate(user, request, decision, at) {
  const review = {
    reviewerUid: user.uid,
    reviewerName: user.name ?? null,
    reviewedAt: at,
    submittedAt: request.safetyReview?.submittedAt ?? null,
    outcome: decision.outcome,
    checklist: decision.checklist,
    comments: decision.comments,
    internalNotes: decision.internalNotes,
  }
  return {
    safetyReview: { ...request.safetyReview, status: OUTCOME_STATUS[decision.outcome], outcome: decision.outcome, decidedAt: at },
    safetyReviews: [...(Array.isArray(request.safetyReviews) ? request.safetyReviews : []), review],
  }
}

// --- What each role sees --------------------------------------------------------------------------

/** May this user see the full review record — checklist, internal notes, reviewer? Assigned Coordinator or in-scope Safety Officer. */
function seesFullReview(user, request) {
  return isAssignedCoordinator(user, request) || inScopeAs(SAFETY_OFFICER, user, request)
}

/**
 * The safety review as this user may see it, or null.
 *
 * - The assigned Coordinator and an in-scope Safety Officer: the status and every recorded review in full,
 *   newest first, without uids.
 * - The owning Organiser: "sees the outcome and actionable comments, but not private internal notes" (SPM-92
 *   AC7; CL3 G8!C17). [Team decision pending — SPM-92] Only the latest outcome and its overall comments;
 *   checklist comments are treated as internal working notes.
 * - Everyone else, a same-organisation colleague included: null.
 */
export function safetyReviewSummary(user, request) {
  const status = shownSafetyReviewStatus(request)
  if (!status) return null
  const reviews = Array.isArray(request.safetyReviews) ? request.safetyReviews : []

  if (seesFullReview(user, request)) {
    return {
      status,
      submittedAt: request.safetyReview?.submittedAt ?? null,
      invalidatedAt: request.safetyReview?.invalidatedAt ?? null,
      invalidatedReason: request.safetyReview?.invalidatedReason ?? null,
      reviews: reviews.map((review) => ({
        reviewerName: review.reviewerName ?? null,
        reviewedAt: review.reviewedAt ?? null,
        outcome: review.outcome,
        checklist: review.checklist ?? {},
        comments: review.comments ?? '',
        internalNotes: review.internalNotes ?? '',
      })).reverse(),
    }
  }

  if (isOwningOrganiser(user, request)) {
    // The latest review's outcome only while it is still the current one: not while a new review is pending,
    // nor once it has been invalidated.
    const latest = reviews.at(-1)
    const current = latest && OUTCOME_STATUS[latest.outcome] === status ? latest : null
    return {
      status,
      outcome: current?.outcome ?? null,
      comments: current?.comments || null,
      reviewedAt: current?.reviewedAt ?? null,
    }
  }

  return null
}

/**
 * The review status for a list item: only to the users who may see the summary, so the list never says more
 * than the event page.
 */
export function safetyReviewListStatus(user, request) {
  if (seesFullReview(user, request) || isOwningOrganiser(user, request)) return shownSafetyReviewStatus(request)
  return null
}

// --- Venue details for the review (SPM-66 AC2) ----------------------------------------------------

/** May this user read the booked venues' safety details: capacity, layouts, accessibility, operating hours? */
export function canViewSafetyVenueDetails(user, request) {
  return seesFullReview(user, request)
}
