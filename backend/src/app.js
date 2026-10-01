import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { getAdminDb } from './config/firebaseAdmin.js'
import { createEventRequestRoutes } from './routes/eventRequestRoutes.js'
import { authenticate as firebaseAuthenticate } from './middleware/authenticate.js'
import healthRoutes from './routes/healthRoutes.js'
import profileRoutes from './routes/profileRoutes.js'
import { createRequestRoutes } from './routes/requestRoutes.js'
import { firestoreEventRequestStore } from './services/eventRequestStore.js'

// Dependencies are injectable so the API tests can serve the real routes and middleware over HTTP
// against in-memory users and requests. server.js uses the defaults: Firebase Auth and Firestore.
// getEventRequestDb returns the Firestore-shaped database the draft routes use; it is called per request.
export function createApp({
  authenticate = firebaseAuthenticate,
  eventRequestStore = firestoreEventRequestStore,
  getEventRequestDb = getAdminDb,
} = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors({ origin: env.clientOrigin }))
  app.use(express.json())
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use('/api/health', healthRoutes)
  app.use('/api/event-requests', createEventRequestRoutes({ authenticate, getDb: getEventRequestDb }))
  app.use('/api/profile', profileRoutes)
  app.use('/api/requests', createRequestRoutes({ authenticate, store: eventRequestStore }))

  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' })
  })

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Request body is not valid JSON' })
    }
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  })

  return app
}

export default createApp()
