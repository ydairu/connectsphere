// SPM-37 — Exclude unavailable equipment from the available quantity: the shared counting rules.

import { describe, expect, it } from 'vitest'

import {
  EQUIPMENT_UNIT_STATUS,
  UNUSABLE_UNIT_STATUSES,
  isUsableUnit,
  normaliseAvailabilityPeriod,
  normaliseEquipmentTypeInput,
  normaliseEquipmentUnitInput,
  normaliseUnitStatusInput,
  summariseUnits,
} from '../../../shared/equipment.js'

const { AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE } = EQUIPMENT_UNIT_STATUS

function units(...statuses) {
  return statuses.map((status, index) => ({ id: `unit-${index + 1}`, assetTag: `MIC-${index + 1}`, status }))
}

describe('SPM-37 — available quantity (unit)', () => {
  it('spm37_ac1_damaged_under_repair_and_unavailable_are_the_excluded_statuses', () => {
    expect([...UNUSABLE_UNIT_STATUSES].sort()).toEqual([DAMAGED, UNAVAILABLE, UNDER_REPAIR].sort())
    expect(isUsableUnit({ status: AVAILABLE })).toBe(true)
    for (const status of UNUSABLE_UNIT_STATUSES) expect(isUsableUnit({ status }), status).toBe(false)
  })

  it('spm37_ac2_ten_units_with_two_damaged_or_under_repair_shows_eight_available', () => {
    const summary = summariseUnits(units(...Array(8).fill(AVAILABLE), DAMAGED, UNDER_REPAIR))

    expect(summary).toEqual({
      totalUnits: 10,
      availableUnits: 8,
      unavailableUnits: 2,
      byStatus: { [AVAILABLE]: 8, [DAMAGED]: 1, [UNDER_REPAIR]: 1, [UNAVAILABLE]: 0 },
    })
  })

  it('spm37_ac3_an_unavailable_unit_is_never_counted_as_available', () => {
    const summary = summariseUnits(units(AVAILABLE, UNAVAILABLE))

    expect(summary.availableUnits).toBe(1)
    expect(summary.byStatus[UNAVAILABLE]).toBe(1)
  })

  it('spm37_ac4_a_repaired_unit_marked_available_is_counted_again', () => {
    const before = units(AVAILABLE, DAMAGED)
    const after = before.map((unit) => (unit.status === DAMAGED ? { ...unit, status: AVAILABLE } : unit))

    expect(summariseUnits(before).availableUnits).toBe(1)
    expect(summariseUnits(after).availableUnits).toBe(2)
  })

  it('spm37_a_unit_with_a_missing_or_unknown_status_is_not_counted_as_available', () => {
    const summary = summariseUnits([{ id: 'a' }, { id: 'b', status: 'lost' }, { id: 'c', status: AVAILABLE }])

    expect(summary.totalUnits).toBe(3)
    expect(summary.availableUnits).toBe(1)
  })

  it('spm37_a_type_with_no_units_has_nothing_available', () => {
    expect(summariseUnits([])).toMatchObject({ totalUnits: 0, availableUnits: 0, unavailableUnits: 0 })
  })
})

describe('SPM-37 — input validation (unit)', () => {
  it('spm37_status_must_be_one_of_the_four_statuses', () => {
    expect(normaliseUnitStatusInput({ status: 'lost' }).errors.status).toBeTruthy()
    expect(normaliseUnitStatusInput({}).errors.status).toBeTruthy()
    for (const status of [AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE]) {
      expect(normaliseUnitStatusInput({ status }).errors, status).toEqual({})
    }
  })

  it('spm37_status_note_is_optional_trimmed_and_limited', () => {
    expect(normaliseUnitStatusInput({ status: DAMAGED, note: '  Cracked casing  ' }).change.note).toBe('Cracked casing')
    expect(normaliseUnitStatusInput({ status: DAMAGED, note: '   ' }).change.note).toBeNull()
    expect(normaliseUnitStatusInput({ status: DAMAGED, note: 'x'.repeat(501) }).errors.note).toBeTruthy()
    expect(normaliseUnitStatusInput({ status: DAMAGED, note: 42 }).errors.note).toBe('Must be text.')
  })

  it('spm37_equipment_type_needs_a_name_and_may_have_a_location', () => {
    expect(normaliseEquipmentTypeInput({}).errors.name).toBe('Required.')
    expect(normaliseEquipmentTypeInput({ name: ' Projector ' }).equipmentType).toEqual({ name: 'Projector', location: null })
    expect(normaliseEquipmentTypeInput({ name: 'Projector', location: 'Store B2' }).equipmentType.location).toBe('Store B2')
  })

  it('spm37_unit_needs_an_asset_tag', () => {
    expect(normaliseEquipmentUnitInput({}).errors.assetTag).toBe('Required.')
    expect(normaliseEquipmentUnitInput({ assetTag: ' MIC-001 ' }).unit.assetTag).toBe('MIC-001')
  })

  it('spm37_a_checked_period_is_optional_but_must_be_valid_when_given', () => {
    expect(normaliseAvailabilityPeriod({})).toEqual({ period: null, errors: {} })
    expect(normaliseAvailabilityPeriod({ from: '2026-11-20T09:00:00.000Z', to: '2026-11-20T17:00:00.000Z' })).toEqual({
      period: { from: '2026-11-20T09:00:00.000Z', to: '2026-11-20T17:00:00.000Z' },
      errors: {},
    })
    expect(normaliseAvailabilityPeriod({ from: '2026-11-20T09:00:00.000Z' }).errors.to).toBeTruthy()
    expect(normaliseAvailabilityPeriod({ from: '2026-11-20T17:00:00.000Z', to: '2026-11-20T09:00:00.000Z' }).errors.to).toBeTruthy()
  })
})
