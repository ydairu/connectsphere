// Every API route set is mounted. An unmounted route answers 404; a mounted, authenticated one answers
// 401 without a token. Guards against a merge dropping an app.use() line from createApp().
// Run: node --test "backend/src/**/*.test.js"

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createApp } from './app.js'

let server
let baseUrl

before(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

describe('API routes are mounted', () => {
  const authenticated = [
    ['GET', '/api/profile'],
    ['POST', '/api/event-requests'], // SPM-7
    ['PATCH', '/api/event-requests/any-id'], // SPM-7
    ['POST', '/api/event-requests/any-id/submit'], // SPM-3
    ['POST', '/api/event-requests/any-id/transitions'], // SPM-9
    ['GET', '/api/requests'], // SPM-42
    ['GET', '/api/requests/any-id'], // SPM-42
    ['PATCH', '/api/requests/any-id'], // SPM-42
    ['POST', '/api/venues'], // SPM-6
    ['GET', '/api/venues/any-id'], // SPM-6
  ]

  for (const [method, path] of authenticated) {
    test(`${method} ${path} without a token`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method })
      assert.equal(response.status, 401)
    })
  }

  test('GET /api/health', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.status, 200)
  })
})
