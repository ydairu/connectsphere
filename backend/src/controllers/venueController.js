import { createVenue, getVenue, listVenues, VenueNotFoundError, VenueValidationError } from '../services/venueService.js'

export function sendVenueError(error, res, next) {
  if (error instanceof VenueValidationError) {
    return res.status(400).json({ message: 'Validation failed', errors: error.errors })
  }
  if (error instanceof VenueNotFoundError) {
    return res.status(404).json({ message: 'Venue not found' })
  }
  return next(error)
}

// getDb is called per request so tests can pass an in-memory database and production can use Firestore.
export function createVenueController(getDb) {
  return {
    async createVenue(req, res, next) {
      try {
        const venue = await createVenue(req.body, req.user, getDb())
        return res.status(201).json({ venue })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async listVenues(_req, res, next) {
      try {
        const venues = await listVenues(getDb())
        return res.json({ venues })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async getVenue(req, res, next) {
      try {
        const venue = await getVenue(req.params.id, getDb())
        return res.json({ venue })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
  }
}
