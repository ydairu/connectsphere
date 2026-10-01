import {
  APPROVE_TECHNICAL,
  APPROVE_VENUE,
  REASON_ACCEPTED_ACTIONS,
  REASON_REQUIRED_ACTIONS,
  REFUSE_CANCELLATION,
  REJECT_TECHNICAL,
  REJECT_VENUE,
  REQUEST_CANCELLATION,
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
  },
  [APPROVE]: { label: 'Approve for planning' },
  [CONFIRM]: { label: 'Confirm event' },
  [REJECT]: {
    label: 'Reject request',
    confirm: 'Reject this request? A rejected request is closed and cannot change status again.',
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
}

export function actionLabel(action) {
  return ACTIONS[action]?.label ?? action
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
