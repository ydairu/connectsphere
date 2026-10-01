import { Router } from 'express'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import { createVenueController } from '../controllers/venueController.js'
import { requireRole } from '../middleware/requireRole.js'

export function createVenueRoutes({ authenticate, getDb }) {
  const controller = createVenueController(getDb)
  const router = Router()

  router.post('/', authenticate, requireRole(VENUE_STAFF), controller.createVenue)

  return router
}
