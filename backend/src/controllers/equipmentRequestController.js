import {
  EquipmentRequestError,
  EquipmentRequestValidationError,
  listEventEquipmentRequests,
  submitEquipmentRequest,
} from '../services/equipmentRequestService.js'

// SPM-17 — GET and POST /api/requests/:id/equipment-requests.
export function createEquipmentRequestController(getDb) {
  const handle = (operation, status = 200) => async (req, res, next) => {
    try {
      return res.status(status).json(await operation(req))
    } catch (error) {
      if (error instanceof EquipmentRequestValidationError) return res.status(400).json({ message: 'Validation failed', errors: error.errors })
      if (error instanceof EquipmentRequestError) return res.status(error.status).json({ message: error.message })
      return next(error)
    }
  }
  return {
    submit: handle(async (req) => ({ equipmentRequest: await submitEquipmentRequest(req.params.id, req.body, req.user, getDb()) }), 201),
    list: handle((req) => listEventEquipmentRequests(req.params.id, req.user, getDb())),
  }
}
