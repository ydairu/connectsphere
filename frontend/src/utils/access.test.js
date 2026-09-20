// SPM-42 #2, presentation side: a signed-in user without permission is refused the page rather than
// redirected to login. Run with the root `npm test`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { isRouteAllowed } from './access.js'

describe('Route role check', () => {
  test('A route with no allowed roles is open to any signed-in user', () => {
    assert.equal(isRouteAllowed([ATTENDEE], undefined), true)
    assert.equal(isRouteAllowed([], []), true)
  })

  test('A user holding the allowed role is let through', () => {
    assert.equal(isRouteAllowed([ORGANISER], [ORGANISER]), true)
  })

  test('A user holding none of the allowed roles is refused', () => {
    assert.equal(isRouteAllowed([ATTENDEE], [ORGANISER]), false)
    assert.equal(isRouteAllowed([], [ORGANISER]), false)
  })

  test('A multi-role user is let through by any one of their roles', () => {
    assert.equal(isRouteAllowed([VENUE_STAFF, TECHNICAL_STAFF], [TECHNICAL_STAFF]), true)
    assert.equal(isRouteAllowed([ATTENDEE, ORGANISER], [ORGANISER]), true)
    assert.equal(isRouteAllowed([VENUE_STAFF, TECHNICAL_STAFF], [COORDINATOR]), false)
  })
})
