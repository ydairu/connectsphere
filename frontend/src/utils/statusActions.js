import {
  APPROVE_TECHNICAL,
  APPROVE_VENUE,
  REASON_ACCEPTED_ACTIONS,
  REASON_REQUIRED_ACTIONS,
  REFUSE_CANCELLATION,
  REJECT_TECHNICAL,
  REJECT_VENUE,
  REQUEST_CANCELLATION,
  RESUBMIT_CANCELLATION,
  RETURN_CANCELLATION,
} from '../../../shared/requestActions.js'
import {
  APPROVE,
  APPROVE_CANCELLATION,
  CANCEL,
  COMPLETE,
  CONFIRM,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  SUBMIT,
} from '../../../shared/statusTransitions.js'
import { SIGNIFICANT_CHANGE } from '../../../shared/significantChanges.js'
import { VENUE_BOOKING_CANCELLED } from '../../../shared/venueBooking.js'

// Button wording for the SPM-9 actions in shared/requestActions.js. `confirm` is the question asked
// before an action that closes the event, hands it back, or records a decision; other actions apply on
// one click.
const ACTIONS = {
  [SUBMIT]: { label: 'Submit request' },
  [RESUBMIT]: { label: 'Resubmit request' },
  [START_REVIEW]: { label: 'Start review' },
  [RETURN_FOR_CLARIFICATION]: {
    label: 'Return for clarification',
    confirm: 'Return this request to the organiser for clarification or amendments?',
    reasonLabel: 'Message to the organiser',
    reasonPrompt: 'Enter a message to the organiser to continue.',
  },
  [APPROVE]: { label: 'Approve for planning' },
  [CONFIRM]: { label: 'Confirm event' },
  [REJECT]: {
    label: 'Reject request',
    confirm:
      'Reject this request? A rejected request is closed and cannot change status again. It cannot be edited or resubmitted; the organiser would need to create a new request.',
    reasonLabel: 'Rejection reason',
    reasonPrompt: 'Enter a rejection reason to continue.',
  },
  [COMPLETE]: {
    label: 'Mark as completed',
    confirm: 'Mark this event as completed? A completed event cannot change status again.',
  },
  [CANCEL]: {
    label: 'Cancel event',
    confirm: 'Cancel this event? A cancelled event cannot change status again.',
  },
  [REQUEST_CANCELLATION]: {
    label: 'Request cancellation',
    confirm: 'Ask the event coordinator to cancel this event? The event stays confirmed until they decide.',
  },
  [APPROVE_CANCELLATION]: {
    label: 'Approve cancellation',
    confirm: 'Approve the organiser’s request and cancel this event? A cancelled event cannot change status again.',
  },
  [REFUSE_CANCELLATION]: {
    label: 'Refuse cancellation',
    confirm: 'Refuse the organiser’s cancellation request? The event stays confirmed.',
  },
  [RETURN_CANCELLATION]: {
    label: 'Return cancellation request',
    confirm: 'Return the organiser’s cancellation request for more information? The event stays confirmed.',
    reasonLabel: 'Message to the organiser',
    reasonPrompt: 'Enter a message to the organiser to continue.',
  },
  [RESUBMIT_CANCELLATION]: {
    label: 'Resubmit cancellation request',
    confirm: 'Send your updated cancellation request to the event coordinator? The event stays confirmed until they decide.',
    reasonLabel: 'Updated reason',
  },
  [APPROVE_VENUE]: { label: 'Approve venue arrangement' },
  [REJECT_VENUE]: {
    label: 'Reject venue arrangement',
    confirm: 'Reject the venue arrangement? The event stays in planning and cannot be confirmed until it is approved.',
  },
  [APPROVE_TECHNICAL]: { label: 'Approve technical arrangement' },
  [REJECT_TECHNICAL]: {
    label: 'Reject technical arrangement',
    confirm: 'Reject the technical arrangement? The event stays in planning and cannot be confirmed until it is approved.',
  },
  // SPM-10: not an action anyone can take — the status_changed entry of a significant edit to a Confirmed
  // event. Labelled so a status history shows it readably; never in availableActions.
  [SIGNIFICANT_CHANGE]: { label: 'Moved back to Planning (significant change)' },
  [VENUE_BOOKING_CANCELLED]: { label: 'Moved back to Planning (venue booking cancelled)' },
}

/** The wording for an action or a status_changed entry's action; an unknown action is shown as it is. */
export function actionLabel(action) {
  return ACTIONS[action]?.label ?? (typeof action === 'string' && action !== '' ? action : 'Status change')
}

export function actionConfirmation(action) {
  return ACTIONS[action]?.confirm ?? null
}

/** 'required', 'optional', or null when the action takes no reason. */
export function actionReason(action) {
  if (REASON_REQUIRED_ACTIONS.includes(action)) return 'required'
  if (REASON_ACCEPTED_ACTIONS.includes(action)) return 'optional'
  return null
}

/** What to tell the user while a required reason is empty. SPM-47, SPM-63: "a message asks for a reason". */
export function actionReasonPrompt(action) {
  if (actionReason(action) !== 'required') return null
  return ACTIONS[action]?.reasonPrompt ?? 'Enter a reason to continue.'
}

/** The label for the action's reason box, e.g. 'Reason (required)'. */
export function actionReasonLabel(action) {
  const mode = actionReason(action)
  if (!mode) return null
  return `${ACTIONS[action]?.reasonLabel ?? 'Reason'} (${mode})`
}
