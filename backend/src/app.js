import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import eventRequestRoutes from './routes/eventRequestRoutes.js'
import healthRoutes from './routes/healthRoutes.js'
import profileRoutes from './routes/profileRoutes.js'

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: env.clientOrigin }))
app.use(express.json())
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.use('/api/health', healthRoutes)
app.use('/api/event-requests', eventRequestRoutes)
app.use('/api/profile', profileRoutes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

export default app
