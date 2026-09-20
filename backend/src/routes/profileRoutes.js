import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/profileController.js'
import { authenticate } from '../middleware/authenticate.js'
import { requireRole } from '../middleware/requireRole.js'
import { ORGANISER } from '../../../shared/permissions.js'

const router = Router()
router.get('/', authenticate, getProfile)
router.patch('/', authenticate, requireRole(ORGANISER), updateProfile)

export default router
