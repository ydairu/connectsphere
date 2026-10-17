// SPM-75 AC1–AC4 — whether a venue is free for a searched period: setup and turnaround count on both
// sides, as SPM-16's conflict rule counts them for a booking request, and expired holds do not block.
// Times are Singapore time (UTC+8).

import { describe, expect, it } from 'vitest'

import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { venueAvailableFor } from '../../../shared/venueSearch.js'

const NOW = new Date('2026-10-17T00:00:00.000Z')

function venue(id, setupMinutes, turnaroundMinutes) {
  return { id, name: id, setupMinutes, turnaroundMinutes }
}

function commitment(venueId, startsAt, endsAt, overrides = {}) {
  return { venueId, status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, startsAt, endsAt, ...overrides }
}

function search(startsAt, endsAt) {
  return { startsAt, endsAt }
}

// A venue with 45 minutes' turnaround, booked 10:00–12:00 on Monday 2 Nov 2026.
const turnaroundHall = venue('turnaround-hall', 0, 45)
const turnaroundBooking = commitment('turnaround-hall', '2026-11-02T10:00:00+08:00', '2026-11-02T12:00:00+08:00')

describe('SPM-75 — venue availability for a searched period (unit)', () => {
  it('spm75_ac1_a_search_starting_during_the_turnaround_excludes_the_venue', () => {
    expect(venueAvailableFor(turnaroundHall, [turnaroundBooking], search('2026-11-02T12:30:00+08:00', '2026-11-02T14:00:00+08:00'), NOW)).toBe(false)
  })

  it('spm75_ac2_a_search_starting_when_the_turnaround_ends_includes_the_venue', () => {
    expect(venueAvailableFor(turnaroundHall, [turnaroundBooking], search('2026-11-02T12:45:00+08:00', '2026-11-02T14:00:00+08:00'), NOW)).toBe(true)
  })

  it('spm75_ac3_a_search_overlapping_only_a_bookings_setup_time_excludes_the_venue', () => {
    // 30 minutes' setup before a 14:00–16:00 booking: the venue is occupied from 13:30.
    const setupHall = venue('setup-hall', 30, 0)
    const booking = commitment('setup-hall', '2026-11-02T14:00:00+08:00', '2026-11-02T16:00:00+08:00')

    // The search's own setup (11:30) is free; only its end, 13:45, reaches into the booking's setup.
    expect(venueAvailableFor(setupHall, [booking], search('2026-11-02T12:00:00+08:00', '2026-11-02T13:45:00+08:00'), NOW)).toBe(false)
    expect(venueAvailableFor(setupHall, [booking], search('2026-11-02T12:00:00+08:00', '2026-11-02T13:30:00+08:00'), NOW)).toBe(true)
  })

  it('spm75_ac4_an_expired_tentative_hold_does_not_exclude_the_venue', () => {
    const hold = (overrides) =>
      commitment('turnaround-hall', '2026-11-02T10:00:00+08:00', '2026-11-02T12:00:00+08:00', {
        status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
        ...overrides,
      })
    const during = search('2026-11-02T10:30:00+08:00', '2026-11-02T11:30:00+08:00')

    expect(venueAvailableFor(turnaroundHall, [hold({ holdExpiresAt: '2026-10-16T00:00:00.000Z' })], during, NOW)).toBe(true)
    expect(venueAvailableFor(turnaroundHall, [hold({ holdExpiresAt: '2026-10-20T00:00:00.000Z' })], during, NOW)).toBe(false)
    // A hold saved before SPM-16 has no expiry and still counts.
    expect(venueAvailableFor(turnaroundHall, [hold({})], during, NOW)).toBe(false)
  })

  it('spm75_the_searched_venues_own_setup_counts_as_it_would_for_a_booking_request', () => {
    // 30 minutes' setup and 45 minutes' turnaround: the 10:00–12:00 booking occupies 09:30–12:45, and an
    // event from 12:45 would need the venue from 12:15.
    const bufferedHall = venue('buffered-hall', 30, 45)
    const booking = commitment('buffered-hall', '2026-11-02T10:00:00+08:00', '2026-11-02T12:00:00+08:00')

    expect(venueAvailableFor(bufferedHall, [booking], search('2026-11-02T12:45:00+08:00', '2026-11-02T14:00:00+08:00'), NOW)).toBe(false)
    expect(venueAvailableFor(bufferedHall, [booking], search('2026-11-02T13:15:00+08:00', '2026-11-02T14:00:00+08:00'), NOW)).toBe(true)
  })

  it('spm75_maintenance_blocks_use_their_own_times_and_removed_bookings_are_ignored', () => {
    const block = commitment('turnaround-hall', '2026-11-02T12:30:00+08:00', '2026-11-02T13:00:00+08:00', {
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      lifecycleStatus: 'active',
      reason: 'maintenance',
    })

    // The search's turnaround (until 12:45) reaches the block; a search after the block does not.
    expect(venueAvailableFor(turnaroundHall, [block], search('2026-11-02T11:00:00+08:00', '2026-11-02T12:00:00+08:00'), NOW)).toBe(false)
    expect(venueAvailableFor(turnaroundHall, [block], search('2026-11-02T13:00:00+08:00', '2026-11-02T14:00:00+08:00'), NOW)).toBe(true)
    expect(
      venueAvailableFor(turnaroundHall, [{ ...turnaroundBooking, lifecycleStatus: 'cancelled' }], search('2026-11-02T10:30:00+08:00', '2026-11-02T11:00:00+08:00'), NOW),
    ).toBe(true)
  })

  it('spm75_a_venue_without_setup_or_turnaround_is_checked_on_raw_times_as_before', () => {
    const legacyHall = { id: 'legacy-hall', name: 'Legacy Hall' }
    const booking = commitment('legacy-hall', '2026-11-02T10:00:00+08:00', '2026-11-02T12:00:00+08:00')

    expect(venueAvailableFor(legacyHall, [booking], search('2026-11-02T12:00:00+08:00', '2026-11-02T13:00:00+08:00'), NOW)).toBe(true)
    expect(venueAvailableFor(legacyHall, [booking], search('2026-11-02T11:59:00+08:00', '2026-11-02T13:00:00+08:00'), NOW)).toBe(false)
  })
})
