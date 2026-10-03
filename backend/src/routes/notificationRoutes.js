import { Router } from 'express'
import { NotificationNotFoundError, listNotifications, markNotificationRead } from '../services/notificationService.js'

// SPM-47, SPM-63 — the signed-in user's in-app notifications. Any signed-in user may read their own; there
// is no role check because every notification is addressed to one uid.
export function createNotificationRoutes({ authenticate, getDb }) {
  const router = Router()

  router.get('/', authenticate, async (req, res, next) => {
    try {
      return res.json({ notifications: await listNotifications(getDb(), req.user.uid) })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/:id/read', authenticate, async (req, res, next) => {
    try {
      return res.json({ notification: await markNotificationRead(getDb(), req.user.uid, req.params.id) })
    } catch (error) {
      if (error instanceof NotificationNotFoundError) return res.status(404).json({ message: 'Not found' })
      return next(error)
    }
  })

  return router
}
