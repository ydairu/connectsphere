import {
  createMaintenanceBlock,
  createVenue,
  getVenueDetails,
  listVenues,
  listVenueAvailability,
  removeMaintenanceBlock,
  updateMaintenanceBlock,
  VenueAvailabilityBlockNotFoundError,
  updateVenue,
  VenueBufferTimesLockedError,
  VenueNotFoundError,
  VenueValidationError,
} from '../services/venueService.js'

export function sendVenueError(error, res, next) {
  if (error instanceof VenueValidationError) {
    return res.status(400).json({ message: 'Validation failed', errors: error.errors })
  }
  if (error instanceof VenueBufferTimesLockedError) {
    return res.status(409).json({ message: 'Setup and turnaround times are locked by a confirmed booking', errors: error.errors })
  }
  if (error instanceof VenueNotFoundError) {
    return res.status(404).json({ message: 'Venue not found' })
  }
  if (error instanceof VenueAvailabilityBlockNotFoundError) {
    return res.status(404).json({ message: 'Maintenance block not found' })
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
    async listVenues(req, res, next) {
      try {
        const { venues, filterOptions } = await listVenues(req.query, getDb())
        return res.json({ venues, filterOptions })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async getVenue(req, res, next) {
      try {
        const venue = await getVenueDetails(req.params.id, getDb())
        return res.json({ venue })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async listVenueAvailability(req, res, next) {
      try {
        const availability = await listVenueAvailability(req.params.id, req.query, getDb())
        return res.json({ availability })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async createMaintenanceBlock(req, res, next) {
      try {
        const block = await createMaintenanceBlock(req.params.id, req.body, req.user, getDb())
        return res.status(201).json({ block })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async updateMaintenanceBlock(req, res, next) {
      try {
        const block = await updateMaintenanceBlock(req.params.id, req.params.blockId, req.body, req.user, getDb())
        return res.json({ block })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async removeMaintenanceBlock(req, res, next) {
      try {
        const block = await removeMaintenanceBlock(req.params.id, req.params.blockId, req.user, getDb())
        return res.json({ block })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
    async updateVenue(req, res, next) {
      try {
        const venue = await updateVenue(req.params.id, req.body, req.user, getDb())
        return res.json({ venue })
      } catch (error) {
        return sendVenueError(error, res, next)
      }
    },
  }
}
