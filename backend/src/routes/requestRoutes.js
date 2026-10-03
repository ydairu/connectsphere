import { Router } from 'express'
import { createRequestController } from '../controllers/requestController.js'
import { authoriseList, authoriseRead, authoriseWrite } from '../middleware/authorise.js'
import { createCoordinatorNameLoader } from '../services/assignedCoordinatorService.js'

// SPM-42's minimum API surface: list, read and section edit. No create, submit or draft-save routes —
// those are SPM-7, SPM-3 and SPM-4.
//
// Route split by status (AGENTS.md §6, team decision of 20 Sep 2026): drafts are
// created and edited through /api/event-requests, which validates field values; everything after
// submission goes through these routes, which evaluate role, record scope and the status gate.
export function createRequestRoutes({ authenticate, store, getUserDb }) {
  const controller = createRequestController(store, createCoordinatorNameLoader(getUserDb))
  const router = Router()

  router.get('/', authenticate, controller.loadAll, authoriseList, controller.sendList)
  router.get('/:id', authenticate, controller.loadOne, controller.loadAssignedCoordinatorName, authoriseRead, controller.sendOne)
  router.patch('/:id', authenticate, controller.loadOne, authoriseWrite, controller.update)

  return router
}
