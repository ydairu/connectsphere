import { Router } from 'express'
import { createVenueBookingController } from '../controllers/venueBookingController.js'
import { createEquipmentRequestController } from '../controllers/equipmentRequestController.js'
import { createRequestController } from '../controllers/requestController.js'
import { authoriseHistory, authoriseList, authoriseRead, authoriseWrite, sendHistory } from '../middleware/authorise.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'
import { createOwnerNameLoader } from '../services/requestOwnerService.js'
import { validatePreparation } from '../middleware/validatePreparation.js'
import { validateVenueRequirements } from '../middleware/validateVenueRequirements.js'
import { refuseSignificantChangeWhileCancellationOpen, validateSignificantFields } from '../middleware/validateSignificantFields.js'
import { createStaffRecipientLoader } from '../services/staffRecipientService.js'
import { loadVenueBookingState, PrimaryVenueError, setPrimaryVenue } from '../services/primaryVenueService.js'
import { presentRequest } from '../middleware/authorise.js'

// SPM-42's minimum API surface: list, read and section edit. No create, submit or draft-save routes —
// those are SPM-7, SPM-3 and SPM-4.
//
// Route split by status (AGENTS.md §6, team decision of 20 Sep 2026): drafts are
// created and edited through /api/event-requests, which validates field values; everything after
// submission goes through these routes, which evaluate role, record scope and the status gate.
export function createRequestRoutes({ authenticate, store, getUserDb, getEventRequestDb, verifySafetyApproval = async () => false }) {
  const controller = createRequestController(
    store,
    createCoordinatorNameLoader(getUserDb),
    createOwnerNameLoader(getUserDb),
    createStaffRecipientLoader(getUserDb),
    getEventRequestDb,
  )
  const router = Router()
  const bookings = createVenueBookingController(getEventRequestDb)
  router.get('/:id/venue-bookings', authenticate, bookings.list)
  router.post('/:id/venue-bookings', authenticate, bookings.submit)
  router.post('/:id/venue-bookings/:bookingId/actions', authenticate, bookings.decide)
  router.put('/:id/primary-venue', authenticate, async (req, res, next) => {
    try { res.json({ primaryVenue: await setPrimaryVenue(req.params.id, req.body, req.user, getEventRequestDb()) }) }
    catch (error) {
      if (error instanceof PrimaryVenueError) return res.status(error.status).json({ message: error.message })
      next(error)
    }
  })
  // SPM-17: the event's equipment requests. Who may read and submit is decided in the service
  // (shared/equipmentRequest.js), as SPM-14's booking routes do.
  const equipmentRequests = createEquipmentRequestController(getEventRequestDb)
  router.get('/:id/equipment-requests', authenticate, equipmentRequests.list)
  router.post('/:id/equipment-requests', authenticate, equipmentRequests.submit)
  // SPM-18: only the request's assigned Technical Support Staff (shared/equipmentAvailabilityCheck.js).
  router.get('/:id/equipment-requests/:requestId/availability', authenticate, equipmentRequests.checkAvailability)
  // SPM-56: the client sends an action ('approve', 'reconfirm_approval'; SPM-36 adds 'reject'), never a status.
  router.post('/:id/equipment-requests/:requestId/actions', authenticate, equipmentRequests.decide)

  router.get('/', authenticate, controller.loadAll, controller.loadOwnerNames, authoriseList, controller.sendList)
  router.get('/:id', authenticate, controller.loadOne, controller.loadAssignedCoordinatorName, controller.loadOwnerNames, authoriseRead,
    async (req, res, next) => {
      try {
        const bookingState = await loadVenueBookingState(req.params.id, req.eventRequest, getEventRequestDb())
        const safetyApproved = await verifySafetyApproval(req.eventRequest, getEventRequestDb()) === true
        res.locals.body = presentRequest(req.user, req.eventRequest, { coordinatorName: req.assignedCoordinatorName, ownerNames: req.ownerNames, ...bookingState, safetyApproved })
        next()
      } catch (error) { next(error) }
    }, controller.sendOne)
  // SPM-48, SPM-13, SPM-10: values are validated after authorisation, so a forbidden field is a 403, not a
  // 400. Then SPM-10 AC7: a significant change while a cancellation request is open is a 409. Nothing is
  // written before controller.update.
  router.patch(
    '/:id',
    authenticate,
    controller.loadOne,
    authoriseWrite,
    validatePreparation,
    validateVenueRequirements,
    validateSignificantFields,
    refuseSignificantChangeWhileCancellationOpen,
    controller.update,
  )
  // SPM-28: read-only. There is deliberately no route that updates or deletes a history entry.
  router.get('/:id/history', authenticate, controller.loadOne, authoriseHistory, controller.loadFieldHistory, sendHistory)

  return router
}
