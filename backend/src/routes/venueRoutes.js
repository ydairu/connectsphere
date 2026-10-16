import { Router } from 'express'
import { createVenueBookingController } from '../controllers/venueBookingController.js'
import { COORDINATOR, VENUE_STAFF } from '../../../shared/permissions.js'
import { createVenueController } from '../controllers/venueController.js'
import { requireRole } from '../middleware/requireRole.js'

export function createVenueRoutes({ authenticate, getDb, getBookingDb = getDb }) {
  const controller = createVenueController(getDb)
  const router = Router()
  router.get('/booking-requests', authenticate, createVenueBookingController(getBookingDb).queue)

  router.post('/', authenticate, requireRole(VENUE_STAFF), controller.createVenue)
  router.get('/', authenticate, requireRole(COORDINATOR, VENUE_STAFF), controller.listVenues)
  router.patch('/:id', authenticate, requireRole(VENUE_STAFF), controller.updateVenue)
  router.post('/:id/maintenance-blocks', authenticate, requireRole(VENUE_STAFF), controller.createMaintenanceBlock)
  router.patch('/:id/maintenance-blocks/:blockId', authenticate, requireRole(VENUE_STAFF), controller.updateMaintenanceBlock)
  router.delete('/:id/maintenance-blocks/:blockId', authenticate, requireRole(VENUE_STAFF), controller.removeMaintenanceBlock)
  router.get('/:id/availability', authenticate, requireRole(COORDINATOR, VENUE_STAFF), controller.listVenueAvailability)
  router.get('/:id', authenticate, requireRole(COORDINATOR, VENUE_STAFF), controller.getVenue)

  return router
}
