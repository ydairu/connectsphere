// SPM-37 — equipment inventory and the available quantity.
//
// [Team decision, 15 Oct 2026 — SPM-37] Equipment is modelled as individual units. An equipment type
// (equipmentTypes/{id}) has units (equipmentUnits/{id}, each with equipmentTypeId), and every unit has its
// own asset tag and status. CL1 left "type/quantity or individual IDs" to the team.
//
// Only an Available unit counts towards the available quantity. Damaged, Under Repair and Unavailable
// units are excluded for every period, because a unit's status is not tied to dates (SPM-37 AC1–AC4).
// Units reserved for an overlapping event are excluded for that period only (SPM-57).

import { validateAvailabilityRange } from './venueAvailability.js'

export const EQUIPMENT_UNIT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  DAMAGED: 'damaged',
  UNDER_REPAIR: 'under_repair',
  UNAVAILABLE: 'unavailable',
})

export const EQUIPMENT_UNIT_STATUSES = Object.freeze(Object.values(EQUIPMENT_UNIT_STATUS))

// SPM-37 AC1: the statuses excluded from the available count.
export const UNUSABLE_UNIT_STATUSES = Object.freeze([
  EQUIPMENT_UNIT_STATUS.DAMAGED,
  EQUIPMENT_UNIT_STATUS.UNDER_REPAIR,
  EQUIPMENT_UNIT_STATUS.UNAVAILABLE,
])

export const EQUIPMENT_UNIT_STATUS_LABELS = Object.freeze({
  [EQUIPMENT_UNIT_STATUS.AVAILABLE]: 'Available',
  [EQUIPMENT_UNIT_STATUS.DAMAGED]: 'Damaged',
  [EQUIPMENT_UNIT_STATUS.UNDER_REPAIR]: 'Under Repair',
  [EQUIPMENT_UNIT_STATUS.UNAVAILABLE]: 'Unavailable',
})

export const EQUIPMENT_UNIT_STATUS_CHANGED = 'equipment_unit_status_changed'

const MAX_NAME_LENGTH = 160
const MAX_ASSET_TAG_LENGTH = 60
const MAX_NOTE_LENGTH = 500

function requiredText(value, maxLength) {
  if (value === undefined || value === null) return { error: 'Required.' }
  if (typeof value !== 'string') return { error: 'Must be text.' }
  const trimmed = value.trim()
  if (!trimmed) return { error: 'Required.' }
  if (trimmed.length > maxLength) return { error: `Must be ${maxLength} characters or fewer.` }
  return { value: trimmed }
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string') return { error: 'Must be text.' }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) return { error: `Must be ${maxLength} characters or fewer.` }
  return { value: trimmed || null }
}

function collect(errors, path, result) {
  if (result.error) errors[path] = result.error
  return result.value
}

export function hasEquipmentValidationErrors(errors) {
  return Object.keys(errors).length > 0
}

// The location is a catalogue reference for Technical Support only; it does not reserve or block a venue
// (CL3 row 34).
export function normaliseEquipmentTypeInput(input = {}) {
  const errors = {}
  const equipmentType = {
    name: collect(errors, 'name', requiredText(input.name, MAX_NAME_LENGTH)),
    location: collect(errors, 'location', optionalText(input.location, MAX_NAME_LENGTH)),
  }
  return { equipmentType, errors }
}

export function normaliseEquipmentUnitInput(input = {}) {
  const errors = {}
  const unit = {
    assetTag: collect(errors, 'assetTag', requiredText(input.assetTag, MAX_ASSET_TAG_LENGTH)),
  }
  return { unit, errors }
}

export function normaliseUnitStatusInput(input = {}) {
  const errors = {}
  const status = typeof input.status === 'string' ? input.status.trim() : ''
  if (!EQUIPMENT_UNIT_STATUSES.includes(status)) errors.status = 'Choose Available, Damaged, Under Repair or Unavailable.'
  const note = collect(errors, 'note', optionalText(input.note, MAX_NOTE_LENGTH))
  return { change: { status, note }, errors }
}

// A unit counts as available only with the Available status, so a unit whose stored status is missing or
// unknown is never counted.
export function isUsableUnit(unit) {
  return unit?.status === EQUIPMENT_UNIT_STATUS.AVAILABLE
}

// `reservedUnitIds` (SPM-57) are units reserved for an event overlapping the checked period: an Available
// unit among them is counted as reserved, not available.
export function summariseUnits(units = [], reservedUnitIds = new Set()) {
  const byStatus = Object.fromEntries(EQUIPMENT_UNIT_STATUSES.map((status) => [status, 0]))
  for (const unit of units) {
    if (unit?.status in byStatus) byStatus[unit.status] += 1
  }
  const usable = units.filter(isUsableUnit)
  const reservedUnits = usable.filter((unit) => reservedUnitIds.has(unit.id)).length
  const availableUnits = usable.length - reservedUnits
  return {
    totalUnits: units.length,
    availableUnits,
    unavailableUnits: units.length - availableUnits,
    reservedUnits,
    byStatus,
  }
}

// An availability check may name a period, validated like a venue availability range. Status exclusions
// apply to every period; with a period, units reserved for events overlapping it are also excluded (SPM-57).
export function normaliseAvailabilityPeriod(query = {}) {
  if (!query.from && !query.to) return { period: null, errors: {} }
  const { from, to, errors } = validateAvailabilityRange({ from: query.from, to: query.to })
  return {
    period: hasEquipmentValidationErrors(errors) ? null : { from: from.toISOString(), to: to.toISOString() },
    errors,
  }
}
