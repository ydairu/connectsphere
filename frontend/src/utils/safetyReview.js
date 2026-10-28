import {
  APPROVE_SAFETY,
  CHECK_CONCERN,
  CHECK_NOT_APPLICABLE,
  CHECK_SATISFACTORY,
  INVALIDATED_BY_EQUIPMENT_REQUESTED,
  INVALIDATED_BY_SIGNIFICANT_CHANGE,
  INVALIDATED_BY_TECHNICAL_REJECTED,
  INVALIDATED_BY_VENUE_BOOKING_CANCELLED,
  INVALIDATED_BY_VENUE_BOOKING_REQUESTED,
  REJECT_SAFETY_ARRANGEMENT,
  REQUEST_SAFETY_CHANGES,
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_INVALIDATED,
  SAFETY_REJECTED,
  SAFETY_REVIEW_PENDING,
} from '../../../shared/safetyReview.js'
import { PLANNING } from '../../../shared/status.js'

// Wording for the SPM-91/92 safety review. The lifecycle status stays Planning throughout; this is shown
// beside it, so the two are never confused.
const STATUS_LABELS = {
  // "On submission, the event ... displays 'Pending safety check'" — SPM-91 AC3.
  [SAFETY_REVIEW_PENDING]: 'Pending safety check',
  [SAFETY_APPROVED]: 'Safety approved',
  [SAFETY_CHANGES_REQUESTED]: 'Safety changes requested',
  [SAFETY_REJECTED]: 'Safety arrangement rejected',
  [SAFETY_INVALIDATED]: 'Safety check required again',
}

const OUTCOME_LABELS = {
  [APPROVE_SAFETY]: 'Approve',
  [REQUEST_SAFETY_CHANGES]: 'Request changes',
  [REJECT_SAFETY_ARRANGEMENT]: 'Reject safety arrangement',
}

const CHECK_RESULT_LABELS = {
  [CHECK_SATISFACTORY]: 'Satisfactory',
  [CHECK_CONCERN]: 'Concern',
  [CHECK_NOT_APPLICABLE]: 'Not applicable',
}

const INVALIDATED_TEXT = {
  [INVALIDATED_BY_SIGNIFICANT_CHANGE]: 'A significant change was saved after the safety check, so the event must be checked again.',
  [INVALIDATED_BY_VENUE_BOOKING_CANCELLED]: 'An approved venue booking was cancelled after the safety check, so the event must be checked again.',
  [INVALIDATED_BY_VENUE_BOOKING_REQUESTED]: 'A venue was requested after the safety check, so the event must be checked again.',
  [INVALIDATED_BY_EQUIPMENT_REQUESTED]: 'An equipment request was submitted after the safety check, so the event must be checked again.',
  [INVALIDATED_BY_TECHNICAL_REJECTED]: 'The technical arrangement was rejected after the safety check, so the event must be checked again.',
}

// What each status asks of whoever reads it. Request changes and rejection leave the event in Planning
// (CL3 G8!C46, C47); rejection is of the venue arrangement, not the event.
const NEXT_STEP = {
  [SAFETY_REVIEW_PENDING]: 'The event is in the safety-review queue. It stays in Planning until the Safety Officer records the review.',
  [SAFETY_APPROVED]: 'The event may be confirmed once every other confirmation condition is met.',
  [SAFETY_CHANGES_REQUESTED]: 'The event stays in Planning. The coordinator makes the changes and resubmits it for safety review.',
  [SAFETY_REJECTED]: 'The venue arrangement was rejected on safety grounds, not the event. It stays in Planning; revise the venue arrangement, then resubmit it for safety review.',
  [SAFETY_INVALIDATED]: 'Another safety check is required before the event can be confirmed.',
}

export function safetyStatusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

export function safetyOutcomeLabel(outcome) {
  return OUTCOME_LABELS[outcome] ?? outcome
}

export function checkResultLabel(result) {
  return CHECK_RESULT_LABELS[result] ?? result
}

/** What the status asks of the reader, while the event is still in Planning; null once it has moved on. */
export function safetyNextStep(status, eventStatus) {
  return eventStatus === PLANNING ? NEXT_STEP[status] ?? null : null
}

export function invalidatedText(reason) {
  return INVALIDATED_TEXT[reason] ?? 'The safety check must be done again.'
}
