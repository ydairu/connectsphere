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
import { loadVenueBookingState } from '../services/primaryVenueService.js'
import { NOT_PERMITTED, UNKNOWN_ACTION } from '../../../shared/statusTransitions.js'
import { NOT_ASSIGNED_STAFF, UNKNOWN_ARRANGEMENT } from '../../../shared/arrangements.js'
import {
  REASON_INVALID,
  REASON_REQUIRED,
  StatusTransitionError,
  transitionEventRequest,
} from '../services/statusTransitionService.js'
import { ReassignmentError, listReassignmentCandidates, reassignEventRequest } from '../services/coordinatorReassignmentService.js'
import { EventStaffAssignmentError } from '../services/eventStaffAssignmentService.js'

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
  // SPM-26: the status code comes with the refusal reason (shared/coordinatorReassignment.js).
  if (error instanceof ReassignmentError) {
    return res.status(error.status).json({ message: error.message, reason: error.reason })
  }
  if (error instanceof EventStaffAssignmentError) {
    return res.status(error.status).json({ message: error.message })
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
// loadCoordinatorName (SPM-46): see services/assignedCoordinatorService.js. loadOwnerNames (SPM-64
// follow-up): see services/requestOwnerService.js.
export function createEventRequestController(getDb, loadCoordinatorName = async () => null, loadOwnerNames = async () => new Map()) {
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
        const coordinatorName = await loadCoordinatorName(req.user, eventRequest)
        const ownerNames = await loadOwnerNames(req.user, [eventRequest])
        const bookingState = await loadVenueBookingState(req.params.id, eventRequest, getDb())
        return res.json(presentRequest(req.user, eventRequest, { coordinatorName, ownerNames, ...bookingState }))
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    // SPM-26 — the Coordinators this event may be handed to: { coordinators: [{ uid, name }] }.
    async listReassignmentCandidates(req, res, next) {
      try {
        const coordinators = await listReassignmentCandidates(req.params.id, req.user, getDb())
        return res.json({ coordinators })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    // SPM-26 — body { coordinatorUid, handoverAgreed: true }. The caller has just lost access to the event
    // (SPM-65), so the response is not the projected request but only who now has it.
    async reassignEventRequest(req, res, next) {
      try {
        const { coordinator } = await reassignEventRequest(req.params.id, req.user, {
          coordinatorUid: req.body?.coordinatorUid,
          handoverAgreed: req.body?.handoverAgreed,
        }, getDb())
        return res.json({ reassigned: true, coordinator: { name: coordinator.name } })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },
  }
}
