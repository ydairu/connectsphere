import { Router } from 'express'
import { getProfile } from '../controllers/profileController.js'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()
router.get('/', authenticate, getProfile)

export default router

