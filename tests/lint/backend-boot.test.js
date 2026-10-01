// Code-quality check: the Express application imports and serves requests in the test environment
// without any Firebase credentials (Firebase Admin initialises lazily), and its fallbacks are JSON.

import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../backend/src/app.js'

describe('Backend boots in the test environment', () => {
  it('imports the default Express app without Firebase Admin credentials', () => {
    expect(typeof app).toBe('function')
  })

  it('serves the public health route', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('answers unknown routes with a JSON 404', async () => {
    const response = await request(app).get('/api/does-not-exist')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Not found' })
  })

  it('rejects malformed JSON bodies with a JSON 400 before authentication', async () => {
    const response = await request(app)
      .post('/api/event-requests')
      .set('Content-Type', 'application/json')
      .send('{not json')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Request body is not valid JSON' })
  })
})
