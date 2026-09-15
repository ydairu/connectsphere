import { Router } from 'express'
import { ORGANISER } from '../../../shared/permissions.js'
import { createEventRequest, updateEventRequest } from '../controllers/eventRequestController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.post('/', authenticate, requireRole(ORGANISER), createEventRequest)
router.patch('/:id', authenticate, requireRole(ORGANISER), updateEventRequest)

export default router
