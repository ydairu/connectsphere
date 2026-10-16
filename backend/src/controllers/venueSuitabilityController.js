import { NOT_AVAILABLE_AT_STATUS } from '../../../shared/venueSuitability.js'
import { VenueSuitabilityUnavailableError, getVenueSuitability } from '../services/venueSuitabilityService.js'
import { VenueNotFoundError } from '../services/venueService.js'
import { sendEventRequestError } from './eventRequestController.js'

// SPM-13. getDb reads the event, getVenueDb the venues and their availability; both are called per
// request so tests and the E2E double can pass in-memory databases.
export function createVenueSuitabilityController(getDb, getVenueDb) {
  return {
    async getVenueSuitability(req, res, next) {
      try {
        const venueId = typeof req.query.venueId === 'string' && req.query.venueId ? req.query.venueId : undefined
        const suitability = await getVenueSuitability(req.params.id, req.user, { venueId }, getDb(), getVenueDb())
        return res.json(suitability)
      } catch (error) {
        if (error instanceof VenueSuitabilityUnavailableError) {
          return res.status(409).json({ message: error.message, reason: NOT_AVAILABLE_AT_STATUS })
        }
        if (error instanceof VenueNotFoundError) return res.status(404).json({ message: 'Venue not found' })
        return sendEventRequestError(error, res, next)
      }
    },
  }
}
