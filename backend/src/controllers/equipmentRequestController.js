import {
  EquipmentRequestError,
  EquipmentRequestShortfallError,
  EquipmentRequestValidationError,
  decideEquipmentRequest,
  listAssignedEquipmentRequests,
  listEventEquipmentRequests,
  submitEquipmentRequest,
} from '../services/equipmentRequestService.js'
import { checkEquipmentRequestAvailability } from '../services/equipmentAvailabilityService.js'

// SPM-17 — GET and POST /api/requests/:id/equipment-requests; SPM-18 — GET .../:requestId/availability;
// SPM-56 — POST .../:requestId/actions and GET /api/equipment/requests/assigned.
export function createEquipmentRequestController(getDb) {
  const handle = (operation, status = 200) => async (req, res, next) => {
    try {
      return res.status(status).json(await operation(req))
    } catch (error) {
      if (error instanceof EquipmentRequestValidationError) return res.status(400).json({ message: 'Validation failed', errors: error.errors })
      if (error instanceof EquipmentRequestShortfallError) return res.status(409).json({ message: error.message, availability: error.availability })
      if (error instanceof EquipmentRequestError) return res.status(error.status).json({ message: error.message })
      return next(error)
    }
  }
  return {
    submit: handle(async (req) => ({ equipmentRequest: await submitEquipmentRequest(req.params.id, req.body, req.user, getDb()) }), 201),
    list: handle((req) => listEventEquipmentRequests(req.params.id, req.user, getDb())),
    decide: handle((req) => decideEquipmentRequest(req.params.id, req.params.requestId, req.body?.action, req.user, getDb())),
    assigned: handle((req) => listAssignedEquipmentRequests(req.user, getDb())),
    checkAvailability: handle(async (req) => ({
      availability: await checkEquipmentRequestAvailability(req.params.id, req.params.requestId, req.user, getDb()),
    })),
  }
}
