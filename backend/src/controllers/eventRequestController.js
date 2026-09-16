import {
  createDraftEventRequest,
  EventRequestForbiddenError,
  EventRequestNotFoundError,
  EventRequestValidationError,
  getOwnedDraftEventRequest,
  updateDraftEventRequest,
} from '../services/eventRequestService.js'

function sendEventRequestError(error, res, next) {
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

export async function createEventRequest(req, res, next) {
  try {
    const eventRequest = await createDraftEventRequest(req.body, req.user)
    return res.status(201).json({ eventRequest })
  } catch (error) {
    return sendEventRequestError(error, res, next)
  }
}

export async function getEventRequest(req, res, next) {
  try {
    const eventRequest = await getOwnedDraftEventRequest(req.params.id, req.user)
    return res.json({ eventRequest })
  } catch (error) {
    return sendEventRequestError(error, res, next)
  }
}

export async function updateEventRequest(req, res, next) {
  try {
    const eventRequest = await updateDraftEventRequest(req.params.id, req.body, req.user)
    return res.json({ eventRequest })
  } catch (error) {
    return sendEventRequestError(error, res, next)
  }
}
