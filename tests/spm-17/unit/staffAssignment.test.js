// SPM-17 — the staff chooser shared by SPM-14 (Venue Staff) and SPM-17 (Technical Support Staff).

import { describe, expect, it } from 'vitest'

import { TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { STAFF_ASSIGNMENT_LOCKS, chooseStaff } from '../../../shared/staffAssignment.js'
import { BOOKING_PENDING, BOOKING_REJECTED, chooseVenueStaff } from '../../../shared/venueBooking.js'
import { coordinator, dualStaff, secondTech, tech, venueStaff } from '../fixtures.js'

describe('SPM-17 chooseStaff', () => {
  const users = [secondTech, tech, venueStaff, coordinator]

  it('spm17_fewest_pending_then_rotation_after_the_last_assignee', () => {
    expect(chooseStaff(users, TECHNICAL_STAFF, [], null).uid).toBe('t1')
    expect(chooseStaff(users, TECHNICAL_STAFF, [], 't1').uid).toBe('t2')
    expect(chooseStaff(users, TECHNICAL_STAFF, [], 't2').uid).toBe('t1')
    expect(chooseStaff(users, TECHNICAL_STAFF, ['t1'], 't2').uid).toBe('t2')
    expect(chooseStaff(users, TECHNICAL_STAFF, ['t2', 't2', 't1'], null).uid).toBe('t1')
  })

  it('spm17_nobody_holding_the_role_gives_null', () => {
    expect(chooseStaff([venueStaff, coordinator], TECHNICAL_STAFF, [], null)).toBeNull()
  })

  it('spm17_a_legacy_single_role_profile_is_eligible', () => {
    expect(chooseStaff([{ uid: 'legacy', role: TECHNICAL_STAFF }], TECHNICAL_STAFF, [], null).uid).toBe('legacy')
  })

  it('spm17_someone_holding_both_staff_roles_is_in_both_pools', () => {
    expect(chooseStaff([dualStaff], TECHNICAL_STAFF, [], null).uid).toBe('d1')
    expect(chooseStaff([dualStaff], VENUE_STAFF, [], null).uid).toBe('d1')
  })

  it('spm17_each_role_has_its_own_rotation_lock_and_venue_keeps_spm14_s', () => {
    expect(STAFF_ASSIGNMENT_LOCKS).toEqual({ [VENUE_STAFF]: 'venueStaffAssignment', [TECHNICAL_STAFF]: 'technicalStaffAssignment' })
  })

  it('spm17_chooseVenueStaff_matches_chooseStaff_on_spm14_cases', () => {
    const venueUsers = [{ uid: 'v1', roles: [VENUE_STAFF] }, { uid: 'v2', roles: [VENUE_STAFF] }, coordinator]
    const bookings = [
      { status: BOOKING_PENDING, assignedVenueStaffUid: 'v1' },
      { status: BOOKING_REJECTED, assignedVenueStaffUid: 'v2' },
    ]
    for (const lastUid of [null, 'v1', 'v2']) {
      for (const list of [[], bookings]) {
        const pending = list.filter((b) => b.status === BOOKING_PENDING).map((b) => b.assignedVenueStaffUid)
        expect(chooseVenueStaff(venueUsers, list, lastUid)).toEqual(chooseStaff(venueUsers, VENUE_STAFF, pending, lastUid))
      }
    }
  })
})
