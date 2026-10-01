// SPM-42 — route-level role gate for multi-role users.

import { describe, expect, it } from 'vitest'

import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { requireRole } from '../../../backend/src/middleware/requireRole.js'

function run(middleware, user) {
  const outcome = { nextCalled: false, status: null }
  const res = {
    status(code) {
      outcome.status = code
      return this
    },
    json() {
      return this
    },
  }
  middleware({ user }, res, () => {
    outcome.nextCalled = true
  })
  return outcome
}

describe("SPM-42 — View and Edit Information According to My Role's Permissions (route gate)", () => {
  it('Venue+technical dual-role account reaches a technical-staff route', () => {
    const outcome = run(requireRole(TECHNICAL_STAFF), { uid: 'u-dual', roles: [VENUE_STAFF, TECHNICAL_STAFF] })
    expect(outcome.nextCalled).toBe(true)
  })

  it('Venue staff account requests a coordinator-only route', () => {
    const outcome = run(requireRole(COORDINATOR), { uid: 'u-venue', roles: [VENUE_STAFF] })
    expect(outcome.nextCalled).toBe(false)
    expect(outcome.status, 'logged in but forbidden is 403, not a redirect to login').toBe(403)
  })

  it('Single-role account written before the roles migration still reaches its route', () => {
    const outcome = run(requireRole(ORGANISER), { uid: 'u-legacy', role: ORGANISER })
    expect(outcome.nextCalled).toBe(true)
  })

  it('Request with no authenticated user is refused', () => {
    const outcome = run(requireRole(ORGANISER), undefined)
    expect(outcome.status).toBe(403)
  })
})
