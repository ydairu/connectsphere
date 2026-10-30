import { RegistrationError, joinWaitingList, listEventRegistrations, listMyRegistrations, registerForEvent } from '../services/registrationService.js'
import { sendEventRequestError } from './eventRequestController.js'

// SPM-19 — POST and GET /api/requests/:id/registrations, GET /api/registrations. Who may do what is decided in
// shared/registration.js. Out of scope maps as for event actions (403, or 404 for a Coordinator); not an
// Attendee → 403; registration unavailable, already registered or full → 409 with `reason`.
export function createRegistrationController(getDb) {
  return {
    async register(req, res, next) {
      try {
        return res.status(201).json(await registerForEvent(req.params.id, req.user, getDb()))
      } catch (error) {
        if (error instanceof RegistrationError) return res.status(error.status).json({ message: error.message, reason: error.reason })
        return sendEventRequestError(error, res, next)
      }
    },

    // SPM-39: join the waiting list of a full event. Refusals map as for registering.
    async joinWaitingList(req, res, next) {
      try {
        return res.status(201).json(await joinWaitingList(req.params.id, req.user, getDb()))
      } catch (error) {
        if (error instanceof RegistrationError) return res.status(error.status).json({ message: error.message, reason: error.reason })
        return sendEventRequestError(error, res, next)
      }
    },

    async listForEvent(req, res, next) {
      try {
        return res.json(await listEventRegistrations(req.params.id, req.user, getDb()))
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    async listMine(req, res, next) {
      try {
        return res.json({ registrations: await listMyRegistrations(req.user, getDb()) })
      } catch (error) {
        return next(error)
      }
    },
  }
}
