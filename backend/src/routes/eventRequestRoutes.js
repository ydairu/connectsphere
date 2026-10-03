import { Router } from 'express'
import { ORGANISER } from '../../../shared/permissions.js'
import { createEventRequestController } from '../controllers/eventRequestController.js'
import { requireRole } from '../middleware/requireRole.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'

// Draft create, load, save and submit (SPM-7, SPM-4, SPM-3). authenticate and getDb come from
// createApp, like the /api/requests routes, so the API tests and the E2E double can serve these too.
export function createEventRequestRoutes({ authenticate, getDb, getUserDb = getDb }) {
  const controller = createEventRequestController(getDb, createCoordinatorNameLoader(getUserDb))
  const router = Router()

  router.post('/', authenticate, requireRole(ORGANISER), controller.createEventRequest)
  router.get('/:id', authenticate, requireRole(ORGANISER), controller.getEventRequest)
  router.patch('/:id', authenticate, requireRole(ORGANISER), controller.updateEventRequest)
  router.post('/:id/submit', authenticate, requireRole(ORGANISER), controller.submitEventRequest)
  // SPM-9 lifecycle actions. No role check here: shared/statusTransitions.js decides who may do what.
  router.post('/:id/transitions', authenticate, controller.transitionEventRequest)

  return router
}
