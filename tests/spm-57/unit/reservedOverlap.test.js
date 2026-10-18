// SPM-57 — equipment already reserved for another overlapping event is not available: the shared rules.

import { describe, expect, it } from 'vitest'

import { EQUIPMENT_UNIT_STATUS, summariseUnits } from '../../../shared/equipment.js'
import { checkRequestAvailability } from '../../../shared/equipmentAvailabilityCheck.js'
import { NON_BLOCKING_EVENT_STATUSES, RESERVATION_STATUS, periodsOverlap, reservationEventIds, reservedUnitIds } from '../../../shared/equipmentReservation.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, REJECTED } from '../../../shared/status.js'

const { AVAILABLE, DAMAGED } = EQUIPMENT_UNIT_STATUS

const at = (time, date = '2026-11-20') => `${date}T${time}:00.000Z`
const period = (from, to, date) => ({ startsAt: at(from, date), endsAt: at(to, date) })

function projectors(count, damaged = 0) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, assetTag: `P-${index + 1}`, status: index < damaged ? DAMAGED : AVAILABLE }))
}

function reservation(unitIds, when, overrides = {}) {
  return { eventRequestId: 'other-event', equipmentTypeId: 'projector', unitIds, status: RESERVATION_STATUS.ACTIVE, ...when, ...overrides }
}

const available = (units, reservations, checked, options) => {
  const blocked = reservedUnitIds(reservations, checked, options)
  return checkRequestAvailability([{ equipmentTypeId: 'projector', quantity: 1 }], new Map([['projector', units]]), blocked).items[0].availableQuantity
}

describe('SPM-57 — overlap (unit)', () => {
  it('spm57_ten_projectors_with_four_reserved_for_an_overlapping_event_shows_six', () => {
    const reserved = reservation(['p1', 'p2', 'p3', 'p4'], period('09:00', '13:00'))
    expect(available(projectors(10), [reserved], period('10:00', '12:00'))).toBe(6)
  })

  it('spm57_a_partial_overlap_is_excluded', () => {
    expect(available(projectors(1), [reservation(['p1'], period('09:00', '11:00'))], period('10:00', '12:00'))).toBe(0)
  })

  it('spm57_back_to_back_periods_do_not_overlap', () => {
    expect(available(projectors(1), [reservation(['p1'], period('09:00', '11:00'))], period('11:00', '13:00'))).toBe(1)
    expect(periodsOverlap(period('09:00', '11:00'), period('11:00', '13:00'))).toBe(false)
    expect(periodsOverlap(period('11:00', '13:00'), period('09:00', '11:00'))).toBe(false)
  })

  it('spm57_a_reservation_on_a_different_date_does_not_count', () => {
    expect(available(projectors(1), [reservation(['p1'], period('09:00', '11:00', '2026-11-21'))], period('09:00', '11:00'))).toBe(1)
  })

  it('spm57_overlap_uses_the_event_times_only_with_no_buffer', () => {
    // One minute apart is not an overlap: no venue setup or turnaround, no equipment buffer.
    expect(periodsOverlap(period('09:00', '10:59'), period('11:00', '12:00'))).toBe(false)
    expect(periodsOverlap(period('09:00', '11:01'), period('11:00', '12:00'))).toBe(true)
    expect(periodsOverlap(period('10:00', '11:00'), period('09:00', '13:00'))).toBe(true)
  })

  it('spm57_ten_units_with_two_damaged_and_three_reserved_shows_five', () => {
    const units = projectors(10, 2)
    const reserved = reservation(['p3', 'p4', 'p5'], period('09:00', '13:00'))
    expect(available(units, [reserved], period('10:00', '12:00'))).toBe(5)
    expect(summariseUnits(units, reservedUnitIds([reserved], period('10:00', '12:00')))).toMatchObject({ totalUnits: 10, availableUnits: 5, reservedUnits: 3 })
  })

  it('spm57_reservations_of_rejected_cancelled_or_completed_events_count_as_available', () => {
    expect([...NON_BLOCKING_EVENT_STATUSES].sort()).toEqual([CANCELLED, COMPLETED, REJECTED].sort())
    const reserved = reservation(['p1'], period('09:00', '11:00'))
    for (const status of [REJECTED, CANCELLED, COMPLETED]) {
      expect(available(projectors(1), [reserved], period('10:00', '12:00'), { eventStatuses: new Map([['other-event', status]]) }), status).toBe(1)
    }
    for (const status of [PLANNING, CONFIRMED]) {
      expect(available(projectors(1), [reserved], period('10:00', '12:00'), { eventStatuses: new Map([['other-event', status]]) }), status).toBe(0)
    }
  })

  it('spm57_a_reservation_whose_event_status_is_unknown_still_counts', () => {
    expect(available(projectors(1), [reservation(['p1'], period('09:00', '11:00'))], period('10:00', '12:00'))).toBe(0)
  })

  it('spm57_a_released_reservation_does_not_count', () => {
    const released = reservation(['p1'], period('09:00', '11:00'), { status: RESERVATION_STATUS.RELEASED })
    expect(available(projectors(1), [released], period('10:00', '12:00'))).toBe(1)
  })

  it('spm57_the_events_own_reservation_is_not_subtracted_on_a_recheck', () => {
    const own = reservation(['p1'], period('09:00', '11:00'), { eventRequestId: 'this-event' })
    expect(available(projectors(1), [own], period('09:00', '11:00'), { ownEventId: 'this-event' })).toBe(1)
    expect(available(projectors(1), [own], period('09:00', '11:00'), { ownEventId: 'another' })).toBe(0)
  })

  it('spm57_only_overlapping_active_reservations_need_their_event_status', () => {
    const reservations = [
      reservation(['p1'], period('09:00', '11:00'), { eventRequestId: 'a' }),
      reservation(['p2'], period('09:00', '11:00', '2026-12-01'), { eventRequestId: 'b' }),
      reservation(['p3'], period('09:00', '11:00'), { eventRequestId: 'c', status: RESERVATION_STATUS.RELEASED }),
    ]
    expect(reservationEventIds(reservations, period('10:00', '12:00'))).toEqual(['a'])
  })
})
