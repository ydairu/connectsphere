import { Router } from 'express'
import { createVenueBookingController } from '../controllers/venueBookingController.js'
import { createEquipmentRequestController } from '../controllers/equipmentRequestController.js'
import { createRequestController } from '../controllers/requestController.js'
import { createSafetyReviewController } from '../controllers/safetyReviewController.js'
import { createSignOffReviewController } from '../controllers/signOffReviewController.js'
import { sendEventRequestError } from '../controllers/eventRequestController.js'
import { assessChangeRequest } from '../services/changeRequestService.js'
import { authoriseHistory, authoriseList, authoriseRead, authoriseWrite, sendHistory } from '../middleware/authorise.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'
import { createOwnerNameLoader } from '../services/requestOwnerService.js'
import { validatePreparation } from '../middleware/validatePreparation.js'
import { validateVenueRequirements } from '../middleware/validateVenueRequirements.js'
import { refuseSignificantChangeWhileCancellationOpen, validateSignificantFields } from '../middleware/validateSignificantFields.js'
import { createStaffRecipientLoader } from '../services/staffRecipientService.js'
import { loadVenueBookingState, PrimaryVenueError, setPrimaryVenue } from '../services/primaryVenueService.js'
import { loadEventPreparationReadiness } from '../services/venueBookingService.js'
import { presentRequest } from '../middleware/authorise.js'
import { createRegistrationController } from '../controllers/registrationController.js'
import { createValidateRegistration } from '../middleware/validateRegistration.js'
import { loadRegistrationContext } from '../services/registrationService.js'
import { attendeeRegistrationSummary } from '../../../shared/registration.js'
import { ATTENDEE, inScopeAs } from '../../../shared/permissions.js'
import { AssignmentError, listUnassignedRequests } from '../services/coordinatorLeadAssignmentService.js'

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
    getEventRequestDb,
  )
  const router = Router()
  // SPM-68: the Event Coordinator Lead's unassigned queue. Registered before '/:id', which would otherwise
  // take "unassigned" as an id. Only a Lead gets 200 (shared/coordinatorLeadAssignment.js); everyone else 403.
  router.get('/unassigned', authenticate, async (req, res, next) => {
    try { res.json(await listUnassignedRequests(req.user, getEventRequestDb())) }
    catch (error) {
      if (error instanceof AssignmentError) return res.status(error.status).json({ message: error.message, reason: error.reason })
      next(error)
    }
  })
  const bookings = createVenueBookingController(getEventRequestDb)
  router.get('/:id/venue-bookings', authenticate, bookings.list)
  router.post('/:id/venue-bookings', authenticate, bookings.submit)
  router.post('/:id/venue-bookings/:bookingId/actions', authenticate, bookings.decide)
  router.patch('/:id/venue-bookings/:bookingId/preparation', authenticate, bookings.updatePreparation)
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
  // SPM-92: the Safety Officer records the review. SPM-66: the booked venues' safety details. Who may do either
  // is decided in shared/safetyReview.js. Submitting for review is an event action (POST /transitions).
  const safetyReviews = createSafetyReviewController(getEventRequestDb)
  router.get('/:id/safety-review/venues', authenticate, safetyReviews.listVenues)
  router.post('/:id/safety-review', authenticate, safetyReviews.decide)
  // SPM-87: the Coordinator chooses which sign-offs changed since approval go back for re-approval. Who may
  // choose and what a choice writes are decided in shared/signOffReview.js.
  router.post('/:id/sign-off-review', authenticate, createSignOffReviewController(getEventRequestDb).decide)
  // SPM-20, SPM-40: an Organiser's change request and the Coordinator's decision and assessment. Who may do each is
  // decided in shared/changeRequests.js. There is deliberately no status in the body: the decision names an action.
  router.post('/:id/change-requests', authenticate, controller.loadOne, controller.submitChangeRequest)
  router.post('/:id/change-requests/decision', authenticate, controller.loadOne, controller.decideChangeRequest)
  router.get('/:id/change-requests/assessment', authenticate, async (req, res, next) => {
    try { res.json(await assessChangeRequest(req.params.id, req.user, getEventRequestDb())) }
    catch (error) { sendEventRequestError(error, res, next) }
  })
  // SPM-19: an Attendee registers; the owning Organiser and assigned Coordinator read the registered list.
  // Who may do either is decided in shared/registration.js.
  const registrations = createRegistrationController(getEventRequestDb)
  router.get('/:id/registrations', authenticate, registrations.listForEvent)
  router.post('/:id/registrations', authenticate, registrations.register)
  // SPM-39: a full event's waiting list.
  router.post('/:id/waiting-list', authenticate, registrations.joinWaitingList)
  // SPM-59: withdraw a registration, leave the waiting list, answer an invitation to a freed place.
  router.post('/:id/registrations/withdraw', authenticate, registrations.withdraw)
  router.post('/:id/waiting-list/leave', authenticate, registrations.leaveWaitingList)
  router.post('/:id/invitation/accept', authenticate, registrations.acceptInvitation)
  router.post('/:id/invitation/decline', authenticate, registrations.declineInvitation)

  router.get('/', authenticate, controller.loadAll, controller.loadOwnerNames, authoriseList, controller.sendList)
  router.get('/:id', authenticate, controller.loadOne, controller.loadAssignedCoordinatorName, controller.loadOwnerNames, authoriseRead,
    async (req, res, next) => {
      try {
        const bookingState = await loadVenueBookingState(req.params.id, req.eventRequest, getEventRequestDb())
        const eventPreparationReadiness = await loadEventPreparationReadiness(req.params.id, req.eventRequest, getEventRequestDb())
        res.locals.body = presentRequest(req.user, req.eventRequest, { coordinatorName: req.assignedCoordinatorName, ownerNames: req.ownerNames, eventPreparationReadiness, ...bookingState })
        // SPM-19: whether this Attendee can register now, and why not. Loaded only for an Attendee in scope.
        res.locals.body.attendeeRegistration = inScopeAs(ATTENDEE, req.user, req.eventRequest)
          ? attendeeRegistrationSummary(req.user, req.eventRequest, await loadRegistrationContext(getEventRequestDb(), req.eventRequest, req.user))
          : null
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
    createValidateRegistration(getEventRequestDb),
    validateVenueRequirements,
    validateSignificantFields,
    refuseSignificantChangeWhileCancellationOpen,
    controller.update,
  )
  // SPM-28: read-only. There is deliberately no route that updates or deletes a history entry.
  router.get('/:id/history', authenticate, controller.loadOne, authoriseHistory, controller.loadFieldHistory, sendHistory)

  return router
}
