import { Router } from 'express'
import { ORGANISER } from '../../../shared/permissions.js'
import { createEventRequestController } from '../controllers/eventRequestController.js'
import { requireRole } from '../middleware/requireRole.js'

// Draft create, load, save and submit (SPM-7, SPM-4, SPM-3). authenticate and getDb come from
// createApp, like the /api/requests routes, so the API tests and the E2E double can serve these too.
export function createEventRequestRoutes({ authenticate, getDb }) {
  const controller = createEventRequestController(getDb)
  const router = Router()

  router.post('/', authenticate, requireRole(ORGANISER), controller.createEventRequest)
  router.get('/:id', authenticate, requireRole(ORGANISER), controller.getEventRequest)
  router.patch('/:id', authenticate, requireRole(ORGANISER), controller.updateEventRequest)
  router.post('/:id/submit', authenticate, requireRole(ORGANISER), controller.submitEventRequest)

  return router
}
