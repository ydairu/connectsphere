// SPM-16 — the booking conflict rule (shared/venueConflicts.js) and tentative hold expiry
// (shared/venueAvailability.js). Pure functions, no Firestore.

import { describe, expect, it } from 'vitest'

import {
  AVAILABILITY_STATUS,
  TENTATIVE_HOLD_DURATION_MS,
  isExpiredHold,
  tentativeHoldExpiresAt,
} from '../../../shared/venueAvailability.js'
import { findVenueConflict } from '../../../shared/venueConflicts.js'
import { occupiedPeriod } from '../../../shared/venueOccupancy.js'

const NOW = new Date('2026-10-15T00:00:00.000Z')
const HALL = Object.freeze({ name: 'Hall', setupMinutes: 30, turnaroundMinutes: 45 })
const ROOM = Object.freeze({ name: 'Room', setupMinutes: 0, turnaroundMinutes: 0 })

function at(time) {
  return `2026-11-20T${time}.000Z`
}

function commitment(overrides) {
  return {
    id: 'existing',
    venueId: 'venue-hall',
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    startsAt: at('10:00:00'),
    endsAt: at('12:00:00'),
    eventRequestId: 'request-existing',
    ...overrides,
  }
}

function candidate(startsAt, endsAt, overrides = {}) {
  return { venueId: 'venue-hall', startsAt: at(startsAt), endsAt: at(endsAt), eventRequestId: 'request-new', ...overrides }
}

function conflictFor(proposed, commitments, venue = HALL) {
  return findVenueConflict({ candidate: proposed, venue, commitments, now: NOW })
}

describe('SPM-16 occupied period (AC1)', () => {
  it('spm16_occupied_period_runs_from_start_minus_setup_to_end_plus_turnaround', () => {
    expect(occupiedPeriod(commitment(), HALL)).toEqual({ startsAt: at('09:30:00'), endsAt: at('12:45:00') })
  })
})

describe('SPM-16 conflict rule', () => {
  it('spm16_booking_at_1230_after_an_event_ending_1200_with_45_minutes_turnaround_conflicts (AC2)', () => {
    expect(conflictFor(candidate('12:30:00', '14:00:00'), [commitment()])).toEqual({
      id: 'existing',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: at('10:00:00'),
      endsAt: at('12:00:00'),
      occupiedStartsAt: at('09:30:00'),
      occupiedEndsAt: at('12:45:00'),
    })
  })

  it('spm16_setup_may_start_exactly_when_the_earlier_turnaround_ends (AC4)', () => {
    // 13:15 start with 30 minutes' setup: the venue is occupied from 12:45, when the earlier turnaround ends.
    expect(conflictFor(candidate('13:15:00', '14:00:00'), [commitment()])).toBeNull()
  })

  it('spm16_one_second_of_overlap_is_a_conflict (AC3)', () => {
    expect(conflictFor(candidate('13:14:59', '14:00:00'), [commitment()])).toMatchObject({ id: 'existing' })
  })

  it('spm16_a_period_ending_exactly_when_the_existing_setup_starts_does_not_conflict', () => {
    // Ends 08:45 + 45 minutes' turnaround = 09:30, when the existing booking's setup starts.
    expect(conflictFor(candidate('07:00:00', '08:45:00'), [commitment()])).toBeNull()
    expect(conflictFor(candidate('07:00:00', '08:45:01'), [commitment()])).toMatchObject({ id: 'existing' })
  })

  it('spm16_an_active_tentative_hold_conflicts_like_a_confirmed_booking (AC5)', () => {
    const hold = commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-10-20T00:00:00.000Z' })
    expect(conflictFor(candidate('12:30:00', '14:00:00'), [hold])).toMatchObject({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_an_expired_tentative_hold_does_not_block (AC7)', () => {
    const expired = commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-10-14T00:00:00.000Z' })
    expect(conflictFor(candidate('10:00:00', '12:00:00'), [expired])).toBeNull()
  })

  it('spm16_a_hold_expiring_exactly_now_no_longer_blocks', () => {
    const expiring = commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: NOW.toISOString() })
    expect(conflictFor(candidate('10:00:00', '12:00:00'), [expiring])).toBeNull()
  })

  it('spm16_a_hold_without_holdExpiresAt_still_blocks', () => {
    const legacy = commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
    expect(conflictFor(candidate('10:00:00', '12:00:00'), [legacy])).toMatchObject({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_cancelled_and_removed_commitments_are_ignored', () => {
    const entries = [
      commitment({ id: 'cancelled', lifecycleStatus: 'cancelled' }),
      commitment({ id: 'removed', status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, lifecycleStatus: 'removed' }),
    ]
    expect(conflictFor(candidate('10:00:00', '12:00:00'), entries)).toBeNull()
  })

  it('spm16_maintenance_blocks_are_compared_without_setup_or_turnaround (AC7)', () => {
    const block = commitment({ id: 'block', status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, startsAt: at('13:00:00'), endsAt: at('14:00:00') })
    // The candidate's setup starts at 14:00, when the block ends; a buffered block would run to 14:45.
    expect(conflictFor(candidate('14:30:00', '15:00:00'), [block])).toBeNull()
    expect(conflictFor(candidate('14:29:59', '15:00:00'), [block])).toMatchObject({ id: 'block', occupiedStartsAt: at('13:00:00'), occupiedEndsAt: at('14:00:00') })
    // The candidate's turnaround ends at 13:00, when the block starts; a buffered block would start at 12:30.
    expect(conflictFor(candidate('11:30:00', '12:15:00'), [block])).toBeNull()
  })

  it('spm16_commitments_at_another_venue_are_ignored', () => {
    expect(conflictFor(candidate('10:00:00', '12:00:00'), [commitment({ venueId: 'venue-room' })])).toBeNull()
  })

  it('spm16_each_venue_of_a_multi_venue_event_is_checked_independently (AC8)', () => {
    const eventHoldAtHall = commitment({ id: 'hall-hold', status: AVAILABILITY_STATUS.TENTATIVE_HOLD, eventRequestId: 'request-multi' })
    const roomBooking = commitment({ id: 'room-booking', venueId: 'venue-room', startsAt: at('09:00:00'), endsAt: at('10:00:00') })
    const entries = [eventHoldAtHall, roomBooking]

    // Same event, same time, the room: the hall hold does not block it, and the room's own 0/0 times
    // let it start exactly when the room's booking ends.
    const atRoom = candidate('10:00:00', '12:00:00', { venueId: 'venue-room', eventRequestId: 'request-multi' })
    expect(conflictFor(atRoom, entries, ROOM)).toBeNull()

    // The room's own clash is still found.
    const clashAtRoom = candidate('09:59:59', '12:00:00', { venueId: 'venue-room', eventRequestId: 'request-multi' })
    expect(conflictFor(clashAtRoom, entries, ROOM)).toMatchObject({ id: 'room-booking' })
  })

  it('spm16_the_same_event_overlapping_its_own_hold_at_the_same_venue_conflicts', () => {
    const ownHold = commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, eventRequestId: 'request-new' })
    expect(conflictFor(candidate('11:00:00', '13:00:00'), [ownHold])).toMatchObject({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_the_earliest_conflict_is_returned', () => {
    const entries = [
      commitment({ id: 'later', startsAt: at('15:00:00'), endsAt: at('16:00:00') }),
      commitment({ id: 'earlier', status: AVAILABILITY_STATUS.TENTATIVE_HOLD }),
    ]
    expect(conflictFor(candidate('11:00:00', '15:30:00'), entries)).toMatchObject({ id: 'earlier' })
  })

  it('spm16_a_venue_saved_before_spm72_is_treated_as_zero_setup_and_turnaround', () => {
    const legacyVenue = { name: 'Old hall' }
    expect(conflictFor(candidate('12:00:00', '13:00:00'), [commitment()], legacyVenue)).toBeNull()
    expect(conflictFor(candidate('11:59:59', '13:00:00'), [commitment()], legacyVenue)).toMatchObject({ id: 'existing' })
  })

  it('spm16_the_widened_search_range_matches_a_direct_comparison_of_occupied_periods', () => {
    // activeCommitmentsInRange is reused over a wider range; this checks it never misses or adds a
    // booking compared with comparing every occupied period directly.
    const step = 5 * 60 * 1000
    const base = Date.parse(at('08:00:00'))
    const existing = commitment()
    const existingOccupied = occupiedPeriod(existing, HALL)
    for (let start = 0; start < 8 * 60 * 60 * 1000; start += step) {
      for (const length of [step, 60 * 60 * 1000]) {
        const proposed = { venueId: 'venue-hall', startsAt: new Date(base + start).toISOString(), endsAt: new Date(base + start + length).toISOString() }
        const proposedOccupied = occupiedPeriod(proposed, HALL)
        const direct =
          Date.parse(proposedOccupied.startsAt) < Date.parse(existingOccupied.endsAt) &&
          Date.parse(existingOccupied.startsAt) < Date.parse(proposedOccupied.endsAt)
        expect(conflictFor(proposed, [existing]) !== null, proposed.startsAt).toBe(direct)
      }
    }
  })
})

describe('SPM-16 tentative hold expiry', () => {
  it('spm16_a_new_hold_expires_seven_days_after_creation_by_default', () => {
    expect(TENTATIVE_HOLD_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(tentativeHoldExpiresAt(NOW)).toBe('2026-10-22T00:00:00.000Z')
  })

  it('spm16_isExpiredHold_applies_only_to_tentative_holds_with_a_past_expiry', () => {
    const past = '2026-10-14T00:00:00.000Z'
    expect(isExpiredHold({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: past }, NOW)).toBe(true)
    expect(isExpiredHold({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-10-16T00:00:00.000Z' }, NOW)).toBe(false)
    expect(isExpiredHold({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD }, NOW)).toBe(false)
    expect(isExpiredHold({ status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, holdExpiresAt: past }, NOW)).toBe(false)
  })
})
