// SPM-72 AC1/AC3/AC4/AC5 — setup and turnaround validation, defaults, the occupied period and the
// confirmed-booking lock.

import { describe, expect, it } from 'vitest'

import { normaliseVenueInput } from '../../../shared/venue.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { hasConfirmedBooking, occupiedPeriod, venueBufferMinutes } from '../../../shared/venueOccupancy.js'

const validVenue = Object.freeze({
  name: 'Conference Hall A',
  location: 'Level 3, Main Campus',
  maximumCapacity: '120',
  facilities: 'Projector',
  accessibilityFeatures: 'Wheelchair access',
  supportedLayouts: 'Theatre',
  operatingHours: 'Monday-Friday 09:00-18:00',
})

const NOW = new Date('2026-10-15T06:00:00.000Z')

function booking(overrides) {
  return {
    venueId: 'venue-a',
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    startsAt: '2026-10-20T02:00:00.000Z',
    endsAt: '2026-10-20T04:00:00.000Z',
    ...overrides,
  }
}

describe('SPM-72 — venue setup and turnaround rules (unit)', () => {
  it('spm72_accepts_whole_minutes_of_zero_or_more', () => {
    const { venue, errors } = normaliseVenueInput({ ...validVenue, setupMinutes: '30', turnaroundMinutes: 0 })

    expect(errors).toEqual({})
    expect(venue.setupMinutes).toBe(30)
    expect(venue.turnaroundMinutes).toBe(0)
  })

  it('spm72_defaults_times_that_are_not_sent_to_zero', () => {
    const { venue, errors } = normaliseVenueInput(validVenue)

    expect(errors).toEqual({})
    expect(venue.setupMinutes).toBe(0)
    expect(venue.turnaroundMinutes).toBe(0)
  })

  it('spm72_blocks_negative_non_numeric_fractional_and_blank_times_and_names_the_field', () => {
    for (const value of ['-5', -1, 'abc', '1.5', 2.5, null, true, ['30']]) {
      expect(normaliseVenueInput({ ...validVenue, setupMinutes: value }).errors).toEqual({
        setupMinutes: 'Must be a whole number of minutes, 0 or more.',
      })
    }

    expect(normaliseVenueInput({ ...validVenue, turnaroundMinutes: '  ' }).errors).toEqual({
      turnaroundMinutes: 'Required. Enter 0 if none is needed.',
    })
  })

  it('spm72_reads_a_venue_created_before_spm72_as_zero_minutes', () => {
    expect(venueBufferMinutes({ name: 'Legacy Hall' })).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 })
    expect(venueBufferMinutes({ setupMinutes: 15, turnaroundMinutes: 0 })).toEqual({ setupMinutes: 15, turnaroundMinutes: 0 })
  })

  it('spm72_occupied_period_of_a_10_to_12_event_with_30_and_45_minutes_is_0930_to_1245', () => {
    // Singapore time, as the customer works in (UTC+8).
    const period = occupiedPeriod(
      { startsAt: '2026-11-02T10:00:00+08:00', endsAt: '2026-11-02T12:00:00+08:00' },
      { setupMinutes: 30, turnaroundMinutes: 45 },
    )

    expect(period).toEqual({
      startsAt: new Date('2026-11-02T09:30:00+08:00').toISOString(),
      endsAt: new Date('2026-11-02T12:45:00+08:00').toISOString(),
    })
  })

  it('spm72_occupied_period_equals_the_event_when_times_are_zero_or_not_set', () => {
    const event = { startsAt: '2026-11-02T02:00:00.000Z', endsAt: '2026-11-02T04:00:00.000Z' }

    expect(occupiedPeriod(event, { setupMinutes: 0, turnaroundMinutes: 0 })).toEqual(event)
    expect(occupiedPeriod(event, { name: 'Legacy Hall' })).toEqual(event)
  })

  it('spm72_a_confirmed_booking_that_has_not_ended_locks_the_times', () => {
    expect(hasConfirmedBooking([booking()], NOW)).toBe(true)
    // Under way now.
    expect(hasConfirmedBooking([booking({ startsAt: '2026-10-15T05:00:00.000Z', endsAt: '2026-10-15T07:00:00.000Z' })], NOW)).toBe(true)
  })

  it('spm72_past_removed_tentative_and_maintenance_commitments_do_not_lock_the_times', () => {
    expect(hasConfirmedBooking([], NOW)).toBe(false)
    expect(hasConfirmedBooking([booking({ startsAt: '2026-10-10T02:00:00.000Z', endsAt: '2026-10-15T06:00:00.000Z' })], NOW)).toBe(false)
    expect(hasConfirmedBooking([booking({ lifecycleStatus: 'cancelled' })], NOW)).toBe(false)
    expect(hasConfirmedBooking([booking({ lifecycleStatus: 'removed' })], NOW)).toBe(false)
    expect(hasConfirmedBooking([booking({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })], NOW)).toBe(false)
    expect(hasConfirmedBooking([booking({ status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK })], NOW)).toBe(false)
  })
})
