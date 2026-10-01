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

export function sendEventRequestError(error, res, next) {
  // SPM-8: there is always meant to be an eligible coordinator, so an empty pool is a server fault. The
  // submit transaction has already been aborted and the draft is unchanged.
  if (error instanceof NoEligibleCoordinatorError) {
    return res.status(500).json({ message: error.message })
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
  }
}
