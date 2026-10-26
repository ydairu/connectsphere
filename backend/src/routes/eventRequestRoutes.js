import { Router } from 'express'
import { ORGANISER } from '../../../shared/permissions.js'
import { createEventRequestController } from '../controllers/eventRequestController.js'
import { createVenueSuitabilityController } from '../controllers/venueSuitabilityController.js'
import { requireRole } from '../middleware/requireRole.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'
import { createOwnerNameLoader } from '../services/requestOwnerService.js'

// Draft create, load, save and submit (SPM-7, SPM-4, SPM-3). authenticate and getDb come from
// createApp, like the /api/requests routes, so the API tests and the E2E double can serve these too.
export function createEventRequestRoutes({ authenticate, getDb, getUserDb = getDb, getVenueDb = getDb, verifySafetyApproval = async () => false }) {
  const controller = createEventRequestController(getDb, createCoordinatorNameLoader(getUserDb), createOwnerNameLoader(getUserDb), verifySafetyApproval)
  const suitabilityController = createVenueSuitabilityController(getDb, getVenueDb)
  const router = Router()

  router.post('/', authenticate, requireRole(ORGANISER), controller.createEventRequest)
  router.get('/:id', authenticate, requireRole(ORGANISER), controller.getEventRequest)
  router.patch('/:id', authenticate, requireRole(ORGANISER), controller.updateEventRequest)
  router.post('/:id/submit', authenticate, requireRole(ORGANISER), controller.submitEventRequest)
  // SPM-9 lifecycle actions. No role check here: shared/statusTransitions.js decides who may do what.
  router.post('/:id/transitions', authenticate, controller.transitionEventRequest)
  // SPM-26 reassignment. Not a transition: the status does not change. No role check here either:
  // shared/coordinatorReassignment.js decides who may reassign.
  router.get('/:id/reassignment/candidates', authenticate, controller.listReassignmentCandidates)
  router.post('/:id/reassignment', authenticate, controller.reassignEventRequest)
  // SPM-13 venue suitability, read-only. No role check here: shared/venueSuitability.js decides who may ask.
  router.get('/:id/venue-suitability', authenticate, suitabilityController.getVenueSuitability)

  return router
}
