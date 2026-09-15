import { Router } from 'express'
import { createRequestController } from '../controllers/requestController.js'
import { authoriseList, authoriseRead, authoriseWrite } from '../middleware/authorise.js'

// SPM-42's minimum API surface: list, read and section edit. No create, submit or draft-save routes —
// those are SPM-7, SPM-3 and SPM-4.
export function createRequestRoutes({ authenticate, store }) {
  const controller = createRequestController(store)
  const router = Router()

  router.get('/', authenticate, controller.loadAll, authoriseList, controller.sendList)
  router.get('/:id', authenticate, controller.loadOne, authoriseRead, controller.sendOne)
  router.patch('/:id', authenticate, controller.loadOne, authoriseWrite, controller.update)

  return router
}
