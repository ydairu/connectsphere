// SPM-76 AC1 — the availability check counts the venue's setup and turnaround time. The event and the
// other bookings are compared on their occupied periods (start − setup to end + turnaround), as SPM-16
// does; a maintenance block has no setup or turnaround of its own.

import { describe, expect, it } from 'vitest'

import { PLANNING } from '../../../shared/status.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SUITABLE, UNSUITABLE, checkVenueSuitability } from '../../../shared/venueSuitability.js'

// Friday 20 November 2026, 09:00–13:00 Singapore time; with 30 minutes' setup and 45 minutes' turnaround
// the event occupies the venue from 08:30 to 13:45.
const event = Object.freeze({
  id: 'event-1',
  status: PLANNING,
  assignedCoordinatorUid: 'coordinator-1',
  core: { preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 4, expectedAttendees: 80 },
  venue: {},
})

const hall = Object.freeze({
  id: 'hall',
  name: 'Hall',
  maximumCapacity: 200,
  setupMinutes: 30,
  turnaroundMinutes: 45,
})

function booking(startsAt, endsAt, overrides = {}) {
  return {
    venueId: 'hall',
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    eventRequestId: 'another-event',
    startsAt: `2026-11-20T${startsAt}:00+08:00`,
    endsAt: `2026-11-20T${endsAt}:00+08:00`,
    ...overrides,
  }
}

function block(startsAt, endsAt) {
  return booking(startsAt, endsAt, { status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, reason: 'renovation', lifecycleStatus: 'active' })
}

function problemsFor(commitments, venue = hall, now) {
  return checkVenueSuitability(event, venue, commitments, now)
}

describe('SPM-76 AC1 — setup and turnaround in the suitability check (unit)', () => {
  it('spm76_ac1_a_booking_whose_turnaround_overlaps_the_events_setup_is_flagged_as_unavailable', () => {
    // Ends 08:15 and needs 45 minutes' turnaround (to 09:00); the event needs 30 minutes' setup from 08:30.
    const { result, problems } = problemsFor([booking('07:00', '08:15')])

    expect(result).toBe(UNSUITABLE)
    expect(problems).toEqual([
      {
        check: 'availability',
        message:
          'Not available: already booked, Fri 20 Nov 2026, 07:00–08:15. The venue needs 45 minutes of turnaround after it and 30 minutes of setup before the event, which overlap.',
      },
    ])
  })

  it('spm76_ac1_a_booking_whose_setup_overlaps_the_events_turnaround_is_flagged_as_unavailable', () => {
    // Starts 13:20 and needs 30 minutes' setup (from 12:50); the event's turnaround runs to 13:45.
    const { result, problems } = problemsFor([booking('13:20', '15:00', { status: AVAILABILITY_STATUS.TENTATIVE_HOLD })])

    expect(result).toBe(UNSUITABLE)
    expect(problems).toEqual([
      {
        check: 'availability',
        message:
          'Not available: tentatively held for another event, Fri 20 Nov 2026, 13:20–15:00. The venue needs 45 minutes of turnaround after the event and 30 minutes of setup before it, which overlap.',
      },
    ])
  })

  it('spm76_ac1_a_maintenance_block_clashes_only_with_the_events_own_setup_or_turnaround', () => {
    const before = problemsFor([block('07:00', '08:45')])
    const after = problemsFor([block('13:30', '15:00')])

    expect(before.result).toBe(UNSUITABLE)
    expect(before.problems[0].message).toBe(
      'Not available: blocked for renovation, Fri 20 Nov 2026, 07:00–08:45. The venue needs 30 minutes of setup before the event, which overlap.',
    )
    expect(after.result).toBe(UNSUITABLE)
    expect(after.problems[0].message).toBe(
      'Not available: blocked for renovation, Fri 20 Nov 2026, 13:30–15:00. The venue needs 45 minutes of turnaround after the event, which overlap.',
    )
  })

  it('spm76_ac1_periods_that_only_touch_after_setup_and_turnaround_are_not_a_clash', () => {
    // Ends 07:45 so its turnaround ends at 08:30, exactly when the event's setup starts; a booking starting
    // 14:15 has its setup start at 13:45, exactly when the event's turnaround ends.
    const { result, problems } = problemsFor([booking('06:00', '07:45'), booking('14:15', '16:00'), block('06:00', '08:30')])

    expect(problems).toEqual([])
    expect(result).toBe(SUITABLE)
  })

  it('spm76_ac1_a_plain_overlap_keeps_the_original_message', () => {
    const { problems } = problemsFor([booking('11:00', '15:00')])

    expect(problems.map((problem) => problem.message)).toEqual(['Not available: already booked, Fri 20 Nov 2026, 11:00–15:00.'])
  })

  it('spm76_ac1_a_venue_with_no_setup_or_turnaround_is_checked_on_the_plain_periods', () => {
    const noBuffers = { ...hall, setupMinutes: 0, turnaroundMinutes: 0 }
    const legacy = { id: 'hall', name: 'Hall', maximumCapacity: 200 }

    expect(problemsFor([booking('07:00', '09:00')], noBuffers).result).toBe(SUITABLE)
    expect(problemsFor([booking('07:00', '09:00')], legacy).result).toBe(SUITABLE)
    expect(problemsFor([booking('07:00', '09:01')], legacy).result).toBe(UNSUITABLE)
  })

  it('spm76_ac1_expired_holds_and_the_events_own_commitments_never_clash_through_setup_or_turnaround', () => {
    const now = new Date('2026-11-10T00:00:00.000Z')
    const expiredHold = booking('07:00', '08:15', { status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-11-09T00:00:00.000Z' })
    const ownBooking = booking('07:00', '08:15', { eventRequestId: 'event-1' })
    const removed = booking('07:00', '08:15', { lifecycleStatus: 'cancelled' })

    expect(problemsFor([expiredHold, ownBooking, removed], hall, now).result).toBe(SUITABLE)
  })

  it('spm76_ac1_every_clashing_commitment_is_named_in_time_order', () => {
    const { problems } = problemsFor([booking('13:20', '15:00'), booking('07:00', '08:15')])

    expect(problems.map((problem) => problem.message.slice(0, 55))).toEqual([
      'Not available: already booked, Fri 20 Nov 2026, 07:00–0',
      'Not available: already booked, Fri 20 Nov 2026, 13:20–1',
    ])
  })
})
