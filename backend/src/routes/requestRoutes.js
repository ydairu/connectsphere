import { Router } from 'express'
import { createVenueBookingController } from '../controllers/venueBookingController.js'
import { createRequestController } from '../controllers/requestController.js'
import { authoriseHistory, authoriseList, authoriseRead, authoriseWrite, sendHistory } from '../middleware/authorise.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'
import { createOwnerNameLoader } from '../services/requestOwnerService.js'
import { validatePreparation } from '../middleware/validatePreparation.js'
import { refuseSignificantChangeWhileCancellationOpen, validateSignificantFields } from '../middleware/validateSignificantFields.js'
import { createStaffRecipientLoader } from '../services/staffRecipientService.js'

// SPM-42's minimum API surface: list, read and section edit. No create, submit or draft-save routes —
// those are SPM-7, SPM-3 and SPM-4.
//
// Route split by status (AGENTS.md §6, team decision of 20 Sep 2026): drafts are
// created and edited through /api/event-requests, which validates field values; everything after
// submission goes through these routes, which evaluate role, record scope and the status gate.
export function createRequestRoutes({ authenticate, store, getUserDb, getEventRequestDb }) {
  const controller = createRequestController(
    store,
    createCoordinatorNameLoader(getUserDb),
    createOwnerNameLoader(getUserDb),
    createStaffRecipientLoader(getUserDb),
  )
  const router = Router()
  const bookings = createVenueBookingController(getEventRequestDb)
  router.get('/:id/venue-bookings', authenticate, bookings.list)
  router.post('/:id/venue-bookings', authenticate, bookings.submit)

  router.get('/', authenticate, controller.loadAll, controller.loadOwnerNames, authoriseList, controller.sendList)
  router.get('/:id', authenticate, controller.loadOne, controller.loadAssignedCoordinatorName, controller.loadOwnerNames, authoriseRead, controller.sendOne)
  // SPM-48, SPM-10: values are validated after authorisation, so a forbidden field is a 403, not a 400. Then
  // SPM-10 AC7: a significant change while a cancellation request is open is a 409. Nothing is written
  // before controller.update.
  router.patch(
    '/:id',
    authenticate,
    controller.loadOne,
    authoriseWrite,
    validatePreparation,
    validateSignificantFields,
    refuseSignificantChangeWhileCancellationOpen,
    controller.update,
  )
  // SPM-28: read-only. There is deliberately no route that updates or deletes a history entry.
  router.get('/:id/history', authenticate, controller.loadOne, authoriseHistory, controller.loadFieldHistory, sendHistory)

  return router
}
