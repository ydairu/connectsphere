// SPM-62 — reserve available equipment for an event: the shared rules.

import { describe, expect, it } from 'vitest'

import { EQUIPMENT_UNIT_STATUS } from '../../../shared/equipment.js'
import {
  EQUIPMENT_REQUEST_STATUS,
  EVENT_NOT_RESERVABLE,
  NOT_REQUEST_ASSIGNEE,
  NOT_TECHNICAL_STAFF,
  REQUEST_NOT_APPROVED,
  RESERVE_EQUIPMENT,
  equipmentDecision,
} from '../../../shared/equipmentRequest.js'
import { chooseUnits, reservedEquipmentRecord, reservedEquipmentSummary } from '../../../shared/equipmentReservation.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { PREPARATION_EQUIPMENT_NOT_RESERVED, canUpdateEquipmentPreparation, preparationReadOnlyReason, EQUIPMENT_PREPARATION } from '../../../shared/preparation.js'
import { CANCELLED, CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'

const { AVAILABLE, DAMAGED } = EQUIPMENT_UNIT_STATUS

const tech = { uid: 't1', roles: [TECHNICAL_STAFF] }
const event = { id: 'event', status: PLANNING, assignedStaffUids: ['t1'], assignedCoordinatorUid: 'c', ownerUid: 'o', organisationId: 'ORG' }
const approved = { eventRequestId: 'event', assignedTechnicalStaffUid: 't1', status: EQUIPMENT_REQUEST_STATUS.APPROVED }
const decide = (user = tech, eventOverrides = {}, requestOverrides = {}) =>
  equipmentDecision(user, { ...event, ...eventOverrides }, { ...approved, ...requestOverrides }, RESERVE_EQUIPMENT)

describe('SPM-62 — who may reserve and when (unit)', () => {
  it('spm62_the_assigned_technical_staff_member_reserves_an_approved_request_at_planning_or_confirmed', () => {
    expect(decide()).toEqual({ allowed: true })
    expect(decide(tech, { status: CONFIRMED })).toEqual({ allowed: true })
  })

  it('spm62_only_technical_support_staff_may_reserve', () => {
    for (const role of [COORDINATOR, ORGANISER, VENUE_STAFF, ATTENDEE]) {
      expect(decide({ uid: 't1', roles: [role] }).reason, role).toBe(NOT_TECHNICAL_STAFF)
    }
    expect(decide({ uid: 't2', roles: [TECHNICAL_STAFF] }).reason).toBe(NOT_REQUEST_ASSIGNEE)
  })

  it('spm62_only_an_approved_request_while_the_event_is_planning_or_confirmed', () => {
    for (const status of ['pending_review', 'reserved', 'rejected', 'closed']) expect(decide(tech, {}, { status }).reason, status).toBe(REQUEST_NOT_APPROVED)
    for (const status of [UNDER_REVIEW, CANCELLED]) expect(decide(tech, { status }).reason, status).toBe(EVENT_NOT_RESERVABLE)
  })
})

describe('SPM-62 — choosing units (unit)', () => {
  const units = [
    { id: 'u3', assetTag: 'P-10', status: AVAILABLE },
    { id: 'u1', assetTag: 'P-2', status: AVAILABLE },
    { id: 'u2', assetTag: 'P-1', status: DAMAGED },
    { id: 'u4', assetTag: 'P-3', status: AVAILABLE },
  ]
  const items = [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2 }]

  it('spm62_units_are_chosen_automatically_lowest_asset_tag_first_and_only_usable_ones', () => {
    expect(chooseUnits(items, new Map([['projector', units]]))).toEqual([
      { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, units: [{ id: 'u1', assetTag: 'P-2' }, { id: 'u4', assetTag: 'P-3' }] },
    ])
  })

  it('spm62_units_reserved_for_an_overlapping_event_are_skipped', () => {
    expect(chooseUnits(items, new Map([['projector', units]]), new Set(['u1']))[0].units.map((unit) => unit.id)).toEqual(['u4', 'u3'])
  })

  it('spm62_the_event_record_holds_types_and_quantities_only', () => {
    const chosen = chooseUnits(items, new Map([['projector', units]]))
    expect(reservedEquipmentRecord('eq-1', chosen, '2026-10-18T00:00:00.000Z')).toEqual({
      equipmentRequestId: 'eq-1',
      items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2 }],
      reservedAt: '2026-10-18T00:00:00.000Z',
    })
  })
})

describe('SPM-62 — what is shown (unit)', () => {
  const reservedEvent = {
    ...event,
    reservedEquipment: { equipmentRequestId: 'eq-1', items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: '2026-10-18T00:00:00.000Z' },
  }

  it('spm62_the_owning_organiser_sees_reserved_types_and_quantities_without_unit_ids', () => {
    const summary = reservedEquipmentSummary({ uid: 'o', roles: [ORGANISER], organisationId: 'ORG' }, reservedEvent)
    expect(summary).toEqual({ items: [{ equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: '2026-10-18T00:00:00.000Z' })
    expect(JSON.stringify(summary)).not.toMatch(/unit|projector"/)
  })

  it('spm62_nothing_reserved_or_a_viewer_without_the_equipment_section_gets_null', () => {
    expect(reservedEquipmentSummary({ uid: 'o', roles: [ORGANISER], organisationId: 'ORG' }, event)).toBeNull()
    expect(reservedEquipmentSummary({ uid: 'x', roles: [ATTENDEE] }, { ...reservedEvent, status: CONFIRMED })).toBeNull()
  })
})

describe('SPM-62 — equipment preparation uses the reservation (unit)', () => {
  it('spm62_equipment_preparation_opens_on_a_reservation_not_on_the_technical_sign_off', () => {
    const signedOffOnly = { status: PLANNING, arrangementApprovals: { technical: { decision: 'approved' } } }
    const reserved = { status: CONFIRMED, reservedEquipment: { items: [{ equipmentTypeId: 'projector', quantity: 1 }] } }
    expect(canUpdateEquipmentPreparation(signedOffOnly)).toBe(false)
    expect(preparationReadOnlyReason(EQUIPMENT_PREPARATION, signedOffOnly)).toBe(PREPARATION_EQUIPMENT_NOT_RESERVED)
    expect(canUpdateEquipmentPreparation(reserved)).toBe(true)
    expect(canUpdateEquipmentPreparation({ ...reserved, status: CANCELLED })).toBe(false)
  })
})
