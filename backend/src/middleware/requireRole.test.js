// SPM-42 — route-level role gate for multi-role users.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { requireRole } from './requireRole.js'

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
  test('Venue+technical dual-role account reaches a technical-staff route', () => {
    const outcome = run(requireRole(TECHNICAL_STAFF), { uid: 'u-dual', roles: [VENUE_STAFF, TECHNICAL_STAFF] })
    assert.equal(outcome.nextCalled, true)
  })

  test('Venue staff account requests a coordinator-only route', () => {
    const outcome = run(requireRole(COORDINATOR), { uid: 'u-venue', roles: [VENUE_STAFF] })
    assert.equal(outcome.nextCalled, false)
    assert.equal(outcome.status, 403, 'logged in but forbidden is 403, not a redirect to login')
  })

  test('Single-role account written before the roles migration still reaches its route', () => {
    const outcome = run(requireRole(ORGANISER), { uid: 'u-legacy', role: ORGANISER })
    assert.equal(outcome.nextCalled, true)
  })

  test('Request with no authenticated user is refused', () => {
    const outcome = run(requireRole(ORGANISER), undefined)
    assert.equal(outcome.status, 403)
  })
})
