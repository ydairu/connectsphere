// SPM-28 unit suite — the field diff, what an edit records, who may view the history and what they see
// (shared/changeHistory.js), plus the panel's formatting (frontend/src/utils/changeHistory.js). Pure functions.

import { describe, expect, it } from 'vitest'

import {
  FIELD_CHANGED,
  canViewChangeHistory,
  editingRole,
  fieldChanges,
  historyEntriesForEdit,
  jsonSafe,
  sameValue,
  visibleChangeHistory,
} from '../../../shared/changeHistory.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { CONFIRMED, DRAFT, PLANNING, PREPARATION, RETURNED, SUBMITTED } from '../../../shared/status.js'
import { EMPTY_VALUE, fieldLabel, formatHistoryValue } from '../../../frontend/src/utils/changeHistory.js'

const owner = { uid: 'org-1', name: 'Owner', roles: [ORGANISER], organisationId: 'ORG-A' }
const colleague = { uid: 'org-2', name: 'Colleague', roles: [ORGANISER], organisationId: 'ORG-A' }
const coordinator = { uid: 'coord-1', name: 'Coordinator', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', name: 'Other', roles: [COORDINATOR] }
const venue = { uid: 'venue-1', name: 'Venue', roles: [VENUE_STAFF] }
const technical = { uid: 'tech-1', name: 'Tech', roles: [TECHNICAL_STAFF] }
const attendee = { uid: 'att-1', name: 'Attendee', roles: [ATTENDEE] }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: PLANNING,
    ownerUid: owner.uid,
    organisationId: 'ORG-A',
    assignedStaffUids: [venue.uid, technical.uid],
    assignedCoordinatorUid: coordinator.uid,
    core: { title: 'Launch', expectedAttendees: 80, preferredDateTime: '2026-11-20T09:00:00+08:00' },
    venue: { layoutPreference: 'theatre', accessibilityRequired: true },
    equipment: { requirements: ['projector', 'microphone'], technicalSupportNeeded: true },
    registration: { enabled: false },
    internal: { planningNotes: 'Hold Hall B' },
    ...overrides,
  }
}

const withSection = (base, section, fields) => ({ ...base, [section]: { ...base[section], ...fields } })

describe('SPM-28 — field diff', () => {
  it('a scalar change is one entry with the section.field path', () => {
    const before = request()
    expect(fieldChanges(before, withSection(before, 'core', { title: 'Launch v2' }))).toEqual([
      { field: 'core.title', oldValue: 'Launch', newValue: 'Launch v2' },
    ])
  })

  it('several fields in several sections give one entry each, in section order then field name', () => {
    const before = request()
    let after = withSection(before, 'venue', { layoutPreference: 'banquet' })
    after = withSection(after, 'core', { title: 'New', expectedAttendees: 120 })
    expect(fieldChanges(before, after).map((change) => change.field)).toEqual(['core.expectedAttendees', 'core.title', 'venue.layoutPreference'])
  })

  it('arrays compare by value: the same items are no change, a different order or item is', () => {
    const before = request()
    expect(fieldChanges(before, withSection(before, 'equipment', { requirements: ['projector', 'microphone'] }))).toEqual([])
    expect(fieldChanges(before, withSection(before, 'equipment', { requirements: ['microphone', 'projector'] }))).toHaveLength(1)
    expect(fieldChanges(before, withSection(before, 'equipment', { requirements: ['projector'] }))).toEqual([
      { field: 'equipment.requirements', oldValue: ['projector', 'microphone'], newValue: ['projector'] },
    ])
  })

  it('nested objects compare by value, whatever their key order', () => {
    const before = request({ venue: { layoutPreference: 'theatre', options: { a: 1, b: [1, 2] } } })
    expect(fieldChanges(before, withSection(before, 'venue', { options: { b: [1, 2], a: 1 } }))).toEqual([])
    expect(fieldChanges(before, withSection(before, 'venue', { options: { a: 2, b: [1, 2] } }))).toEqual([
      { field: 'venue.options', oldValue: { a: 1, b: [1, 2] }, newValue: { a: 2, b: [1, 2] } },
    ])
  })

  it('a missing field becoming a value has oldValue null; missing and null are no change', () => {
    const before = request()
    expect(fieldChanges(before, withSection(before, 'core', { description: 'New text' }))).toEqual([
      { field: 'core.description', oldValue: null, newValue: 'New text' },
    ])
    expect(fieldChanges(before, withSection(before, 'core', { description: null }))).toEqual([])
  })

  it('saving the same values is no change', () => {
    const before = request()
    expect(fieldChanges(before, withSection(before, 'core', { title: 'Launch', expectedAttendees: 80 }))).toEqual([])
  })

  it('a number and its text form are different values (PATCH does not validate — a known gap)', () => {
    const before = request()
    expect(fieldChanges(before, withSection(before, 'core', { expectedAttendees: '80' }))).toHaveLength(1)
  })

  it('record metadata is never a field change', () => {
    const before = request()
    expect(fieldChanges(before, { ...before, status: CONFIRMED, assignedCoordinatorUid: 'coord-2', updatedAt: 'later' })).toEqual([])
  })

  it('values are stored JSON-safe', () => {
    expect(jsonSafe(undefined)).toBeNull()
    expect(jsonSafe(Number.NaN)).toBeNull()
    expect(jsonSafe(new Date('2026-10-04T00:00:00.000Z'))).toBe('2026-10-04T00:00:00.000Z')
    expect(jsonSafe({ a: undefined, b: [undefined, 1] })).toEqual({ a: null, b: [null, 1] })
    expect(sameValue(undefined, null)).toBe(true)
  })
})

describe('SPM-28 — what an edit records', () => {
  it('AC2: one field_changed entry per changed field, with actor uid, name and role, and no time yet', () => {
    const before = request({ status: SUBMITTED })
    const entries = historyEntriesForEdit(coordinator, before, withSection(withSection(before, 'core', { title: 'A' }), 'internal', { planningNotes: 'B' }))
    expect(entries).toEqual([
      { type: FIELD_CHANGED, field: 'core.title', oldValue: 'Launch', newValue: 'A', actor: { type: 'user', uid: coordinator.uid, name: 'Coordinator', role: COORDINATOR } },
      { type: FIELD_CHANGED, field: 'internal.planningNotes', oldValue: 'Hold Hall B', newValue: 'B', actor: { type: 'user', uid: coordinator.uid, name: 'Coordinator', role: COORDINATOR } },
    ])
  })

  it('AC3: a draft records nothing', () => {
    const before = request({ status: DRAFT, assignedCoordinatorUid: null })
    expect(historyEntriesForEdit(owner, before, withSection(before, 'core', { title: 'Changed' }))).toEqual([])
  })

  it('AC4: a save that changes nothing records nothing', () => {
    const before = request({ status: RETURNED })
    expect(historyEntriesForEdit(owner, before, withSection(before, 'core', { title: 'Launch' }))).toEqual([])
  })

  it.each([
    ['the owner at Returned', owner, RETURNED, 'core', ORGANISER],
    ['venue staff at Preparation', venue, PREPARATION, 'venuePreparation', VENUE_STAFF],
    ['technical staff at Preparation', technical, PREPARATION, 'equipmentPreparation', TECHNICAL_STAFF],
    ['the coordinator on internal planning', coordinator, PLANNING, 'internal', COORDINATOR],
  ])('actor role: %s', (_label, user, status, section, role) => {
    expect(editingRole(user, request({ status }), section)).toBe(role)
  })

  it('actor role for a multi-role user is the role that permits that section', () => {
    const organiserVenue = { uid: owner.uid, name: 'Both', roles: [ORGANISER, VENUE_STAFF], organisationId: 'ORG-A' }
    const preparation = request({ status: PREPARATION, assignedStaffUids: [owner.uid] })
    expect(editingRole(organiserVenue, preparation, 'venuePreparation')).toBe(VENUE_STAFF)
    expect(editingRole(organiserVenue, request({ status: RETURNED }), 'core')).toBe(ORGANISER)
    expect(editingRole(venue, preparation, 'core')).toBeNull()
  })
})

describe('SPM-28 — who may view the history', () => {
  it('AC1: the assigned Coordinator and the owning Organiser', () => {
    expect(canViewChangeHistory(coordinator, request())).toBe(true)
    expect(canViewChangeHistory(owner, request())).toBe(true)
  })

  it.each([
    ['an unassigned Coordinator', otherCoordinator],
    ['a same-organisation colleague', colleague],
    ['assigned Venue Staff', venue],
    ['assigned Technical Support Staff', technical],
    ['an Attendee', attendee],
    ['the assigned uid without the Coordinator role', { uid: coordinator.uid, roles: [VENUE_STAFF] }],
  ])('AC7: %s may not', (_label, user) => {
    expect(canViewChangeHistory(user, request())).toBe(false)
    expect(visibleChangeHistory(user, request(), [])).toBeNull()
  })
})

describe('SPM-28 — what each viewer sees', () => {
  const stored = [
    { id: 'e1', type: FIELD_CHANGED, field: 'core.title', oldValue: 'A', newValue: 'B', actor: { type: 'user', uid: 'coord-1', name: 'Coordinator', role: COORDINATOR }, at: '2026-10-01T10:00:00.000Z' },
    { id: 'e2', type: FIELD_CHANGED, field: 'internal.planningNotes', oldValue: '', newValue: 'Note', actor: { type: 'user', uid: 'coord-1', name: 'Coordinator', role: COORDINATOR }, at: '2026-10-03T10:00:00.000Z' },
    { id: 'e3', type: FIELD_CHANGED, field: 'venue.layoutPreference', oldValue: 'a', newValue: 'b', actor: { type: 'user', uid: 'venue-1', name: 'Venue', role: VENUE_STAFF }, at: '2026-10-02T10:00:00.000Z' },
    { id: 'e4', type: FIELD_CHANGED, field: 'core.expectedAttendees', oldValue: 1, newValue: 2, actor: { type: 'user', uid: 'org-1', name: 'Owner', role: ORGANISER }, at: '2026-10-03T10:00:00.000Z' },
    { id: 's1', type: 'status_changed', fromStatus: 'submitted', toStatus: 'under_review', actor: { type: 'user', uid: 'coord-1' }, at: '2026-10-04T10:00:00.000Z' },
  ]

  it('AC5: the Coordinator sees every field change, newest first (one save\'s entries then by field)', () => {
    expect(visibleChangeHistory(coordinator, request(), stored).map((entry) => entry.id)).toEqual(['e4', 'e2', 'e3', 'e1'])
  })

  it('AC6: the Organiser sees the same entries without internal planning', () => {
    expect(visibleChangeHistory(owner, request(), stored).map((entry) => entry.id)).toEqual(['e4', 'e3', 'e1'])
  })

  it('other activity types are never shown', () => {
    expect(visibleChangeHistory(coordinator, request(), stored).some((entry) => entry.id === 's1')).toBe(false)
  })

  it('no actor uid is returned to anyone', () => {
    for (const user of [coordinator, owner]) {
      for (const entry of visibleChangeHistory(user, request(), stored)) {
        expect(Object.keys(entry).sort()).toEqual(['actor', 'at', 'field', 'id', 'newValue', 'oldValue'])
        expect(Object.keys(entry.actor).sort()).toEqual(['name', 'role', 'type'])
      }
    }
  })

  it('a Coordinator who also owns the event sees internal planning changes', () => {
    const ownerCoordinator = { uid: 'oc', roles: [ORGANISER, COORDINATOR], organisationId: 'ORG-A' }
    const own = request({ ownerUid: 'oc', assignedCoordinatorUid: 'oc' })
    expect(visibleChangeHistory(ownerCoordinator, own, stored)).toHaveLength(4)
  })
})

describe('SPM-28 — panel formatting', () => {
  it('labels known fields by section and label, unknown ones by path', () => {
    expect(fieldLabel('core.title')).toBe('Event details · Title')
    expect(fieldLabel('internal.planningNotes')).toBe('Internal planning · Planning notes')
    expect(fieldLabel('venue.somethingNew')).toBe('venue.somethingNew')
  })

  it('formats null, arrays, booleans and dates', () => {
    expect(formatHistoryValue('core.description', null)).toBe(EMPTY_VALUE)
    expect(EMPTY_VALUE).toBe('—')
    expect(formatHistoryValue('core.description', '')).toBe(EMPTY_VALUE)
    expect(formatHistoryValue('equipment.requirements', ['projector', 'microphone'])).toBe('projector, microphone')
    expect(formatHistoryValue('equipment.requirements', [])).toBe(EMPTY_VALUE)
    expect(formatHistoryValue('venue.accessibilityRequired', true)).toBe('Yes')
    expect(formatHistoryValue('core.expectedAttendees', 80)).toBe('80')
    expect(formatHistoryValue('core.preferredDateTime', '2026-11-20T09:00:00+08:00')).toContain('2026')
  })
})
