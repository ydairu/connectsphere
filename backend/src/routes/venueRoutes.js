import { Router } from 'express'
import { COORDINATOR, VENUE_STAFF } from '../../../shared/permissions.js'
import { createVenueController } from '../controllers/venueController.js'
import { requireRole } from '../middleware/requireRole.js'

export function createVenueRoutes({ authenticate, getDb }) {
  const controller = createVenueController(getDb)
  const router = Router()

  router.post('/', authenticate, requireRole(VENUE_STAFF), controller.createVenue)
  router.get('/', authenticate, requireRole(COORDINATOR, VENUE_STAFF), controller.listVenues)
  router.patch('/:id', authenticate, requireRole(VENUE_STAFF), controller.updateVenue)
  router.get('/:id', authenticate, requireRole(COORDINATOR, VENUE_STAFF), controller.getVenue)

  return router
}
