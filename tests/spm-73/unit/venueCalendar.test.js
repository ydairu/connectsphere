// SPM-73 AC1/AC2 — the availability calendar shows each booking's and hold's setup and turnaround as
// their own unavailable slots, apart from the event time. Times are Singapore time (UTC+8).

import { describe, expect, it } from 'vitest'

import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SETUP_SLOT, TURNAROUND_SLOT, buildVenueCalendar } from '../../../shared/venueCalendar.js'

const sgt = (time) => new Date(`2026-11-02T${time}:00+08:00`)
const iso = (time) => sgt(time).toISOString()

function range(from, to) {
  return { from: sgt(from), to: sgt(to) }
}

const hall = { id: 'hall', name: 'Hall', setupMinutes: 30, turnaroundMinutes: 45 }

const booking = Object.freeze({
  id: 'booking-1',
  venueId: 'hall',
  status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
  startsAt: iso('10:00'),
  endsAt: iso('12:00'),
  title: 'Annual meeting',
  eventRequestId: 'event-1',
})

function statuses(calendar) {
  return calendar.slots.map((slot) => [slot.status, slot.startsAt, slot.endsAt])
}

describe('SPM-73 — calendar with setup and turnaround (unit)', () => {
  it('spm73_ac1_a_booking_is_shown_with_its_setup_and_turnaround_as_separate_slots', () => {
    const calendar = buildVenueCalendar([booking], range('08:00', '14:00'), hall)

    expect(statuses(calendar)).toEqual([
      [AVAILABILITY_STATUS.AVAILABLE, iso('08:00'), iso('09:30')],
      [SETUP_SLOT, iso('09:30'), iso('10:00')],
      [AVAILABILITY_STATUS.CONFIRMED_BOOKING, iso('10:00'), iso('12:00')],
      [TURNAROUND_SLOT, iso('12:00'), iso('12:45')],
      [AVAILABILITY_STATUS.AVAILABLE, iso('12:45'), iso('14:00')],
    ])
    expect(calendar.slots[1]).toEqual({
      status: SETUP_SLOT,
      commitmentId: 'booking-1',
      commitmentStatus: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      venueId: 'hall',
      startsAt: iso('09:30'),
      endsAt: iso('10:00'),
      title: 'Annual meeting',
    })
    expect(calendar.buffers).toEqual({ setupMinutes: 30, turnaroundMinutes: 45 })
  })

  it('spm73_ac2_a_period_overlapping_only_turnaround_or_setup_is_shown_as_unavailable', () => {
    const turnaroundOnly = buildVenueCalendar([booking], range('12:00', '12:45'), hall)
    const setupOnly = buildVenueCalendar([booking], range('09:30', '10:00'), hall)

    expect(statuses(turnaroundOnly)).toEqual([[TURNAROUND_SLOT, iso('12:00'), iso('12:45')]])
    expect(statuses(setupOnly)).toEqual([[SETUP_SLOT, iso('09:30'), iso('10:00')]])
  })

  it('spm73_a_booking_just_outside_the_period_still_shows_its_setup_or_turnaround_inside_it', () => {
    const afterBooking = buildVenueCalendar([booking], range('12:15', '14:00'), hall)
    const beforeBooking = buildVenueCalendar([booking], range('08:00', '09:45'), hall)

    expect(statuses(afterBooking)).toEqual([
      [TURNAROUND_SLOT, iso('12:15'), iso('12:45')],
      [AVAILABILITY_STATUS.AVAILABLE, iso('12:45'), iso('14:00')],
    ])
    expect(statuses(beforeBooking)).toEqual([
      [AVAILABILITY_STATUS.AVAILABLE, iso('08:00'), iso('09:30')],
      [SETUP_SLOT, iso('09:30'), iso('09:45')],
    ])
  })

  it('spm73_tentative_holds_get_setup_and_turnaround_too', () => {
    const hold = { ...booking, id: 'hold-1', status: AVAILABILITY_STATUS.TENTATIVE_HOLD, title: 'Product launch' }
    const calendar = buildVenueCalendar([hold], range('09:00', '13:00'), hall)

    expect(calendar.slots.filter((slot) => [SETUP_SLOT, TURNAROUND_SLOT].includes(slot.status))).toEqual([
      expect.objectContaining({ status: SETUP_SLOT, commitmentId: 'hold-1', commitmentStatus: AVAILABILITY_STATUS.TENTATIVE_HOLD }),
      expect.objectContaining({ status: TURNAROUND_SLOT, commitmentId: 'hold-1', commitmentStatus: AVAILABILITY_STATUS.TENTATIVE_HOLD }),
    ])
  })

  it('spm73_maintenance_blocks_get_no_setup_or_turnaround', () => {
    const block = {
      id: 'block-1',
      venueId: 'hall',
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      lifecycleStatus: 'active',
      reason: 'maintenance',
      startsAt: iso('10:00'),
      endsAt: iso('11:00'),
      title: 'Lighting repair',
    }

    expect(statuses(buildVenueCalendar([block], range('09:00', '12:00'), hall))).toEqual([
      [AVAILABILITY_STATUS.AVAILABLE, iso('09:00'), iso('10:00')],
      [AVAILABILITY_STATUS.MAINTENANCE_BLOCK, iso('10:00'), iso('11:00')],
      [AVAILABILITY_STATUS.AVAILABLE, iso('11:00'), iso('12:00')],
    ])
  })

  it('spm73_a_venue_without_setup_or_turnaround_shows_the_spm11_calendar_unchanged', () => {
    const calendar = buildVenueCalendar([booking], range('08:00', '14:00'), { id: 'hall', name: 'Hall' })

    expect(calendar.slots).toEqual([
      { status: AVAILABILITY_STATUS.AVAILABLE, startsAt: iso('08:00'), endsAt: iso('10:00') },
      {
        id: 'booking-1',
        venueId: 'hall',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: iso('10:00'),
        endsAt: iso('12:00'),
        title: 'Annual meeting',
        reason: null,
        eventRequestId: 'event-1',
      },
      { status: AVAILABILITY_STATUS.AVAILABLE, startsAt: iso('12:00'), endsAt: iso('14:00') },
    ])
    expect(calendar.buffers).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 })
  })

  it('spm73_removed_bookings_are_not_shown', () => {
    const calendar = buildVenueCalendar([{ ...booking, lifecycleStatus: 'removed' }], range('08:00', '14:00'), hall)

    expect(statuses(calendar)).toEqual([[AVAILABILITY_STATUS.AVAILABLE, iso('08:00'), iso('14:00')]])
  })
})
