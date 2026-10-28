import { Router } from 'express'
import { createRegistrationController } from '../controllers/registrationController.js'

// SPM-19 — the signed-in Attendee's own registrations ("My registrations"). Any signed-in user may ask; the
// query is by the uid from the verified token, so each user receives only their own.
export function createRegistrationRoutes({ authenticate, getDb }) {
  const router = Router()
  router.get('/', authenticate, createRegistrationController(getDb).listMine)
  return router
}
