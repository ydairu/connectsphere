// @vitest-environment node
// Real Express HTTP routing with mocked Firebase token verification and Firestore.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../../../backend/src/app.js'

const fake = vi.hoisted(() => ({ users: new Map(), failWrites: false }))
vi.mock('../../../backend/src/config/firebaseAdmin.js', () => ({
  getAdminAuth: () => ({
    async verifyIdToken(token) {
      if (!fake.users.has(token)) throw new Error('Invalid token')
      return { uid: token }
    },
  }),
  getAdminDb: () => ({
    collection(name) {
      expect(name).toBe('users')
      return { doc: (uid) => ({
        async get() {
          return { exists: fake.users.has(uid), data: () => fake.users.get(uid) }
        },
        async update(fields) {
          if (fake.failWrites) throw new Error('Database unavailable')
          fake.users.set(uid, { ...fake.users.get(uid), ...fields })
        },
      }) }
    },
  }),
}))

let server
let url
beforeAll(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve())
    server.on('error', reject)
  })
  url = `http://127.0.0.1:${server.address().port}/api/profile`
})
afterAll(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
})
beforeEach(() => {
  fake.failWrites = false
  fake.users.clear()
  fake.users.set('organiser', { name: 'Organiser', roles: ['organiser'], organisationId: 'org-1', organisationName: 'Org A' })
  fake.users.set('other', { roles: ['organiser'], organisationName: 'Other Org' })
  fake.users.set('attendee', { roles: ['attendee'] })
  fake.users.set('multi', { roles: ['attendee', 'organiser'] })
})

function patch(token, body = { organisationName: 'Org B' }) {
  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/profile', () => {
  it('rejects missing and invalid authentication on direct requests', async () => {
    for (const token of [undefined, 'invalid']) {
      expect((await patch(token)).status).toBe(401)
    }
  })

  it('rejects an authenticated non-organiser', async () => {
    expect((await patch('attendee')).status).toBe(403)
    expect(fake.users.get('attendee')).not.toHaveProperty('organisationName')
  })

  it('saves only the signed-in organiser’s trimmed name and returns it on subsequent profile reads', async () => {
    const response = await patch('organiser', { organisationName: ' Org B ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ organisationName: 'Org B' })
    expect(fake.users.get('organiser')).toMatchObject({ roles: ['organiser'], organisationId: 'org-1' })
    expect(fake.users.get('other').organisationName).toBe('Other Org')
    const profile = await fetch(url, { headers: { Authorization: 'Bearer organiser' } })
    expect((await profile.json()).user.organisationName).toBe('Org B')
  })

  it('allows a multi-role organiser to add a previously missing name', async () => {
    expect((await patch('multi')).status).toBe(200)
    expect(fake.users.get('multi')).toEqual({ roles: ['attendee', 'organiser'], organisationName: 'Org B' })
  })

  it('rejects blank names and protected-field changes without saving', async () => {
    for (const body of [{ organisationName: ' ' }, { organisationName: 123 }, { organisationName: 'Org B', uid: 'other' }, { organisationName: 'Org B', organisationId: 'org-2' }, { organisationName: 'Org B', roles: ['coordinator'] }]) {
      expect((await patch('organiser', body)).status).toBe(400)
    }
    expect(fake.users.get('organiser').organisationName).toBe('Org A')
  })

  it('returns a server error without claiming a successful save when persistence fails', async () => {
    fake.failWrites = true
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await patch('organiser')).status).toBe(500)
      expect(fake.users.get('organiser').organisationName).toBe('Org A')
    } finally {
      errorLog.mockRestore()
    }
  })
})
