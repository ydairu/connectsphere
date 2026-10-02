import {
  createDraftEventRequest,
  EventRequestForbiddenError,
  EventRequestNotFoundError,
  EventRequestValidationError,
  getOwnedDraftEventRequest,
  submitDraftEventRequest,
  updateDraftEventRequest,
} from '../services/eventRequestService.js'
import { NoEligibleCoordinatorError } from '../services/coordinatorAssignmentService.js'
import { presentRequest } from '../middleware/authorise.js'
import { NOT_PERMITTED, UNKNOWN_ACTION } from '../../../shared/statusTransitions.js'
import { NOT_ASSIGNED_STAFF, UNKNOWN_ARRANGEMENT } from '../../../shared/arrangements.js'
import {
  REASON_INVALID,
  REASON_REQUIRED,
  StatusTransitionError,
  transitionEventRequest,
} from '../services/statusTransitionService.js'

const FORBIDDEN_REASONS = Object.freeze([NOT_PERMITTED, NOT_ASSIGNED_STAFF])
const BAD_REQUEST_REASONS = Object.freeze([UNKNOWN_ACTION, UNKNOWN_ARRANGEMENT, REASON_REQUIRED, REASON_INVALID])

export function sendEventRequestError(error, res, next) {
  // SPM-8: there is always meant to be an eligible coordinator, so an empty pool is a server fault. The
  // submit transaction has already been aborted and the draft is unchanged.
  if (error instanceof NoEligibleCoordinatorError) {
    return res.status(500).json({ message: error.message })
  }
  // SPM-9: not permitted → 403; a malformed action or reason → 400; otherwise the request's current state
  // (status, a guard, a pending cancellation request) does not allow the action right now → 409.
  if (error instanceof StatusTransitionError) {
    const code = FORBIDDEN_REASONS.includes(error.reason) ? 403 : BAD_REQUEST_REASONS.includes(error.reason) ? 400 : 409
    return res.status(code).json({ message: error.message, reason: error.reason })
  }
  if (error instanceof EventRequestValidationError) {
    return res.status(400).json({ message: 'Validation failed', errors: error.errors })
  }
  if (error instanceof EventRequestForbiddenError) {
    return res.status(403).json({ message: error.message })
  }
  if (error instanceof EventRequestNotFoundError) {
    return res.status(404).json({ message: error.message })
  }
  return next(error)
}

// getDb is called per request, not at construction, so the production app never touches Firebase until a
// request arrives; tests and the E2E double pass an in-memory database.
export function createEventRequestController(getDb) {
  return {
    async createEventRequest(req, res, next) {
      try {
        const eventRequest = await createDraftEventRequest(req.body, req.user, getDb())
        return res.status(201).json({ eventRequest })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    async getEventRequest(req, res, next) {
      try {
        const eventRequest = await getOwnedDraftEventRequest(req.params.id, req.user, getDb())
        return res.json({ eventRequest })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    async updateEventRequest(req, res, next) {
      try {
        const eventRequest = await updateDraftEventRequest(req.params.id, req.body, req.user, getDb())
        return res.json({ eventRequest })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    async submitEventRequest(req, res, next) {
      try {
        const eventRequest = await submitDraftEventRequest(req.params.id, req.user, getDb())
        return res.json({ eventRequest })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    // SPM-9 — body { action, reason? }. The response is shaped like GET /api/requests/:id: projected for
    // this user.
    async transitionEventRequest(req, res, next) {
      const action = req.body?.action
      if (typeof action !== 'string' || action === '') {
        return res.status(400).json({ message: 'Expected { "action": "<action>", "reason"?: "<text>" }' })
      }
      try {
        const eventRequest = await transitionEventRequest(req.params.id, action, req.user, getDb(), new Date(), {
          reason: req.body.reason,
        })
        return res.json(presentRequest(req.user, eventRequest))
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },
  }
}
