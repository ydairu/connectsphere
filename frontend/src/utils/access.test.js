// SPM-42 #2, presentation side: a signed-in user without permission is refused the page rather than
// redirected to login. Run with `npm test` (Vitest, via the root script).

import { describe, expect, it } from 'vitest'

import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { isRouteAllowed } from './access.js'

describe('Route role check', () => {
  it('A route with no allowed roles is open to any signed-in user', () => {
    expect(isRouteAllowed([ATTENDEE], undefined)).toBe(true)
    expect(isRouteAllowed([], [])).toBe(true)
  })

  it('A user holding the allowed role is let through', () => {
    expect(isRouteAllowed([ORGANISER], [ORGANISER])).toBe(true)
  })

  it('A user holding none of the allowed roles is refused', () => {
    expect(isRouteAllowed([ATTENDEE], [ORGANISER])).toBe(false)
    expect(isRouteAllowed([], [ORGANISER])).toBe(false)
  })

  it('A multi-role user is let through by any one of their roles', () => {
    expect(isRouteAllowed([VENUE_STAFF, TECHNICAL_STAFF], [TECHNICAL_STAFF])).toBe(true)
    expect(isRouteAllowed([ATTENDEE, ORGANISER], [ORGANISER])).toBe(true)
    expect(isRouteAllowed([VENUE_STAFF, TECHNICAL_STAFF], [COORDINATOR])).toBe(false)
  })
})
