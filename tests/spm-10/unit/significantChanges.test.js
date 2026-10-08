// SPM-10 unit suite — field classification, normalisation and validation, the effects of a significant change
// (shared/significantChanges.js), the notices (shared/notifications.js), the significant flag in the change
// history (shared/changeHistory.js) and the status-history label (frontend/src/utils/statusActions.js).

import { describe, expect, it } from 'vitest'

import { historyEntriesForEdit, visibleChangeHistory } from '../../../shared/changeHistory.js'
import { SIGNIFICANT_CHANGE_NOTICE } from '../../../shared/notifications.js'
import { COORDINATOR, ORGANISER } from '../../../shared/permissions.js'
import { arrangementsApproved, requiredArrangements } from '../../../shared/arrangements.js'
import {
  REQUIRED_SIGNIFICANT_FIELDS,
  SIGNIFICANT_CHANGE,
  SIGNIFICANT_FIELDS,
  isSignificantField,
  mayNotifyStaff,
  normaliseSignificantPatch,
  normaliseSignificantValue,
  sameSignificantValue,
  significantChangeBlocked,
  significantChangeEffects,
  significantChanges,
  significantFieldsIn,
} from '../../../shared/significantChanges.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { actionLabel } from '../../../frontend/src/utils/statusActions.js'
import { SECTION_FIELDS } from '../../../frontend/src/utils/requestSections.js'
import { toFormValues, withSavedValues } from '../../../frontend/src/utils/requestPatch.js'

const coordinator = { uid: 'coord-1', name: 'Coordinator', roles: [COORDINATOR] }
const owner = { uid: 'org-1', name: 'Owner', roles: [ORGANISER], organisationId: 'ORG-A' }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: CONFIRMED,
    ownerUid: owner.uid,
    organisationId: 'ORG-A',
    assignedCoordinatorUid: coordinator.uid,
    assignedStaffUids: ['venue-1', 'tech-1'],
    arrangementApprovals: { venue: { decision: 'approved' }, technical: { decision: 'approved' } },
    core: { title: 'Launch', purpose: 'P', description: 'D', preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 4, expectedAttendees: 80 },
    venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: null },
    equipment: { requirements: ['projector'], technicalSupportNeeded: true },
    registration: { enabled: true, notes: null },
    internal: { planningNotes: 'n' },
    ...overrides,
  }
}

const withField = (base, path, value) => {
  const [section, name] = path.split('.')
  return { ...base, [section]: { ...base[section], [name]: value } }
}

describe('SPM-10 — classification of every field', () => {
  const ALL_FIELDS = Object.entries(SECTION_FIELDS).flatMap(([section, { fields }]) => fields.map((field) => `${section}.${field.name}`))
  const EXPECTED_SIGNIFICANT = [
    'core.preferredDateTime', 'core.durationHours', 'core.expectedAttendees',
    'venue.layoutPreference', 'venue.accessibilityRequired', 'venue.accessibilityNeeds',
    'equipment.requirements', 'equipment.technicalSupportNeeded',
  ]

  it.each(ALL_FIELDS.map((path) => [path, EXPECTED_SIGNIFICANT.includes(path)]))('%s is significant: %s', (path, significant) => {
    expect(isSignificantField(path)).toBe(significant)
  })

  it('every significant field exists on the request page, and nothing else is listed', () => {
    expect([...SIGNIFICANT_FIELDS].sort()).toEqual([...EXPECTED_SIGNIFICANT].sort())
    for (const path of SIGNIFICANT_FIELDS) expect(ALL_FIELDS, path).toContain(path)
  })

  it('the required ones are date/time, duration, attendance and layout', () => {
    expect([...REQUIRED_SIGNIFICANT_FIELDS].sort()).toEqual(['core.durationHours', 'core.expectedAttendees', 'core.preferredDateTime', 'venue.layoutPreference'])
  })

  it('significantFieldsIn reads a section-keyed patch', () => {
    expect(significantFieldsIn({ core: { title: 'x', expectedAttendees: 1 }, equipment: { requirements: [] }, internal: { planningNotes: 'y' } }))
      .toEqual(['core.expectedAttendees', 'equipment.requirements'])
    expect(significantFieldsIn({ core: 'not an object' })).toEqual([])
  })
})

describe('SPM-10 AC6 — normalisation', () => {
  it.each([
    ['core.expectedAttendees', '80', 80],
    ['core.expectedAttendees', 80, 80],
    ['core.durationHours', '2.5', 2.5],
    ['core.preferredDateTime', '2026-11-20T09:00:00+08:00', '2026-11-20T01:00:00.000Z'],
    ['venue.layoutPreference', '  banquet ', 'banquet'],
    ['venue.accessibilityNeeds', '', null],
    ['equipment.requirements', [' projector ', '', 'mic'], ['projector', 'mic']],
    ['equipment.technicalSupportNeeded', false, false],
  ])('%s: %j is stored as %j', (path, input, stored) => {
    expect(normaliseSignificantValue(path, input)).toEqual({ value: stored })
  })

  it.each([
    ['core.expectedAttendees', 80, '80'],
    ['core.durationHours', 4, '4.0'],
    ['core.preferredDateTime', '2026-11-20T09:00:00+08:00', '2026-11-20T01:00:00Z'],
    ['equipment.requirements', ['a', 'b'], [' a', 'b ']],
    ['equipment.technicalSupportNeeded', undefined, false],
    ['equipment.requirements', undefined, []],
    ['venue.accessibilityNeeds', null, ''],
  ])('%s: %j and %j are the same value', (path, a, b) => {
    expect(sameSignificantValue(path, a, b)).toBe(true)
  })

  it.each([
    ['core.expectedAttendees', 80, 81],
    ['core.preferredDateTime', '2026-11-20T09:00:00+08:00', '2026-11-20T09:00:00Z'],
    ['equipment.requirements', ['a', 'b'], ['b', 'a']],
  ])('%s: %j and %j differ', (path, a, b) => {
    expect(sameSignificantValue(path, a, b)).toBe(false)
  })
})

describe('SPM-10 AC6 — validation', () => {
  it.each([
    ['core.expectedAttendees', 12.5],
    ['core.expectedAttendees', -1],
    ['core.expectedAttendees', '12 people'],
    ['core.expectedAttendees', true],
    ['core.durationHours', 0],
    ['core.durationHours', 'long'],
    ['core.preferredDateTime', 'not a date'],
    ['core.preferredDateTime', 20261120],
    ['venue.layoutPreference', 'x'.repeat(2001)],
    ['venue.layoutPreference', ['theatre']],
    ['venue.accessibilityNeeds', 5],
    ['equipment.requirements', 'projector'],
    ['equipment.requirements', [1]],
    ['equipment.technicalSupportNeeded', 'true'],
    ['venue.accessibilityRequired', 0],
  ])('after submission, %s = %j is an error', (path, value) => {
    expect(normaliseSignificantValue(path, value).error).toEqual(expect.any(String))
  })

  it.each(REQUIRED_SIGNIFICANT_FIELDS)('after submission, %s cannot be cleared', (path) => {
    for (const empty of [null, undefined, '', '  ']) expect(normaliseSignificantValue(path, empty)).toEqual({ error: 'Required.' })
  })

  it.each(REQUIRED_SIGNIFICANT_FIELDS)('a draft may clear %s', (path) => {
    expect(normaliseSignificantValue(path, '', { draft: true })).toEqual({ value: null })
  })

  it('a draft keeps the draft rules: flags coerce, a list may be one item per line, formats still apply', () => {
    expect(normaliseSignificantValue('equipment.technicalSupportNeeded', 'yes', { draft: true })).toEqual({ value: false })
    expect(normaliseSignificantValue('equipment.requirements', 'projector\nmic', { draft: true })).toEqual({ value: ['projector', 'mic'] })
    expect(normaliseSignificantValue('core.expectedAttendees', -3, { draft: true }).error).toEqual(expect.any(String))
  })

  it('normaliseSignificantPatch keeps ordinary fields as sent, drops unchanged significant ones, and names errors', () => {
    const base = request()
    expect(normaliseSignificantPatch(base, { core: { title: '  T  ', expectedAttendees: '80', durationHours: '6' }, internal: { planningNotes: 'x' } })).toEqual({
      patch: { core: { title: '  T  ', durationHours: 6 }, internal: { planningNotes: 'x' } },
      errors: {},
    })
    expect(normaliseSignificantPatch(base, { core: { expectedAttendees: '80' } })).toEqual({ patch: {}, errors: {} })
    expect(normaliseSignificantPatch(base, { core: { expectedAttendees: 0, title: 'ok' } }).errors).toEqual({ 'core.expectedAttendees': expect.any(String) })
    expect(normaliseSignificantPatch(request({ status: RETURNED }), { core: { durationHours: null } }).errors).toEqual({ 'core.durationHours': 'Required.' })
    expect(normaliseSignificantPatch(request({ status: DRAFT }), { core: { durationHours: null } })).toEqual({ patch: { core: { durationHours: null } }, errors: {} })
  })
})

describe('SPM-10 AC2–AC5 — effects of a significant change', () => {
  const at = '2026-10-09T10:00:00.000Z'

  it('an ordinary change has no effect at any status', () => {
    for (const status of [SUBMITTED, UNDER_REVIEW, PLANNING, CONFIRMED]) {
      const before = request({ status })
      expect(significantChangeEffects(coordinator, before, withField(before, 'core.title', 'New'), { at, staffRecipientUids: ['venue-1'] }))
        .toEqual({ significantFields: [], metadata: {}, statusChange: null, notifications: [] })
    }
  })

  it.each([SUBMITTED, UNDER_REVIEW, RETURNED])('%s: identified as significant, no other effect', (status) => {
    const before = request({ status, arrangementApprovals: undefined })
    const effects = significantChangeEffects(coordinator, before, withField(before, 'core.expectedAttendees', 120), { at, staffRecipientUids: ['venue-1'] })
    expect(effects).toEqual({ significantFields: ['core.expectedAttendees'], metadata: {}, statusChange: null, notifications: [] })
  })

  it('Planning: recorded decisions cleared, status kept, staff notified', () => {
    const before = request({ status: PLANNING })
    const effects = significantChangeEffects(coordinator, before, withField(before, 'venue.layoutPreference', 'banquet'), { at, staffRecipientUids: ['venue-1', 'tech-1'] })
    expect(effects.metadata).toEqual({ arrangementApprovals: {} })
    expect(effects.statusChange).toBeNull()
    expect(effects.notifications.map((notice) => notice.recipientUid)).toEqual(['venue-1', 'tech-1'])
    expect(effects.notifications[0]).toMatchObject({ type: SIGNIFICANT_CHANGE_NOTICE, status: PLANNING, changedFields: ['Layout preference'], createdAt: at })
  })

  it('Confirmed: decisions cleared, status back to Planning, with the status change described', () => {
    const before = request()
    const after = withField(withField(before, 'core.durationHours', 6), 'equipment.requirements', ['projector', 'mic'])
    const effects = significantChangeEffects(coordinator, before, after, { at, staffRecipientUids: ['tech-1'] })
    expect(effects.metadata).toEqual({ arrangementApprovals: {}, status: PLANNING })
    expect(effects.statusChange).toEqual({ fromStatus: CONFIRMED, toStatus: PLANNING, fields: ['core.durationHours', 'equipment.requirements'] })
    expect(effects.notifications[0].message).toMatch(/moved back to Planning/)
  })

  it('"Not required" is derived, not cleared: after the reset, an event that needs no technical support needs only the venue sign-off', () => {
    const before = request({ status: PLANNING })
    const after = withField(withField(before, 'equipment.requirements', []), 'equipment.technicalSupportNeeded', false)
    const cleared = { ...after, ...significantChangeEffects(coordinator, before, after, { at }).metadata }
    expect(requiredArrangements(cleared)).toEqual(['venue'])
    expect(arrangementsApproved(cleared)).toBe(false)
    expect(arrangementsApproved({ ...cleared, arrangementApprovals: { venue: { decision: 'approved' } } })).toBe(true)
  })

  it('AC5: after the reset, Confirm needs both approvals again', () => {
    const before = request({ status: PLANNING })
    const after = withField(before, 'core.expectedAttendees', 150)
    const cleared = { ...after, ...significantChangeEffects(coordinator, before, after, { at }).metadata }
    expect(arrangementsApproved(cleared)).toBe(false)
    expect(arrangementsApproved({ ...cleared, arrangementApprovals: { venue: { decision: 'approved' } } })).toBe(false)
  })

  it('the actor is never notified, nor anyone twice', () => {
    const before = request({ status: PLANNING })
    const effects = significantChangeEffects(coordinator, before, withField(before, 'core.durationHours', 9), { at, staffRecipientUids: ['venue-1', 'venue-1', coordinator.uid] })
    expect(effects.notifications.map((notice) => notice.recipientUid)).toEqual(['venue-1'])
  })

  it('mayNotifyStaff only when a significant field is saved at Planning or Confirmed with staff assigned', () => {
    expect(mayNotifyStaff(request(), { core: { expectedAttendees: 1 } })).toBe(true)
    expect(mayNotifyStaff(request(), { core: { title: 'x' } })).toBe(false)
    expect(mayNotifyStaff(request({ status: UNDER_REVIEW }), { core: { expectedAttendees: 1 } })).toBe(false)
    expect(mayNotifyStaff(request({ assignedStaffUids: [] }), { core: { expectedAttendees: 1 } })).toBe(false)
  })

  it('significantChanges compares by meaning', () => {
    const before = request()
    expect(significantChanges(before, withField(before, 'core.preferredDateTime', '2026-11-20T01:00:00.000Z'))).toEqual([])
    expect(significantChanges(before, withField(before, 'core.preferredDateTime', '2026-11-21T01:00:00.000Z'))).toEqual(['core.preferredDateTime'])
  })
})

describe('SPM-10 AC7 — the cancellation-request block', () => {
  it.each([
    [CONFIRMED, { status: 'pending' }, true],
    [CONFIRMED, { status: 'returned' }, true],
    [CONFIRMED, { status: 'refused' }, false],
    [CONFIRMED, undefined, false],
    [PLANNING, { status: 'pending' }, false],
  ])('%s with %j: blocked %s', (status, cancellationRequest, blocked) => {
    expect(significantChangeBlocked(request({ status, cancellationRequest }))).toBe(blocked)
  })
})

describe('SPM-10 — the change history marks significant entries', () => {
  it('historyEntriesForEdit adds significant: true only on significant fields', () => {
    const before = request({ status: UNDER_REVIEW })
    const after = withField(withField(before, 'core.title', 'New'), 'core.expectedAttendees', 99)
    const entries = historyEntriesForEdit(coordinator, before, after)
    expect(entries.find((entry) => entry.field === 'core.expectedAttendees').significant).toBe(true)
    expect(entries.find((entry) => entry.field === 'core.title')).not.toHaveProperty('significant')
  })

  it('visibleChangeHistory passes the flag to the Coordinator and the Organiser', () => {
    const stored = [
      { id: 'e1', type: 'field_changed', field: 'core.expectedAttendees', oldValue: 80, newValue: 99, significant: true, actor: { type: 'user', uid: 'c', name: 'C', role: COORDINATOR }, at: '2026-10-09T10:00:00.000Z' },
      { id: 'e2', type: 'field_changed', field: 'core.title', oldValue: 'a', newValue: 'b', actor: { type: 'user', uid: 'c', name: 'C', role: COORDINATOR }, at: '2026-10-08T10:00:00.000Z' },
    ]
    for (const user of [coordinator, owner]) {
      const [significant, ordinary] = visibleChangeHistory(user, request(), stored)
      expect(significant.significant).toBe(true)
      expect(ordinary).not.toHaveProperty('significant')
    }
  })
})

describe('SPM-10 — status history wording', () => {
  it('the significant_change status entry has a readable label', () => {
    expect(actionLabel(SIGNIFICANT_CHANGE)).toBe('Moved back to Planning (significant change)')
  })

  it('an unknown or missing action does not break the label', () => {
    expect(actionLabel('some_future_action')).toBe('some_future_action')
    expect(actionLabel(undefined)).toBe('Status change')
    expect(actionLabel(null)).toBe('Status change')
  })

  it('closed statuses are untouched by these rules', () => {
    for (const status of [COMPLETED, CANCELLED, REJECTED]) {
      const before = request({ status })
      expect(significantChangeEffects(coordinator, before, withField(before, 'core.durationHours', 9), { at: 'x' }).metadata).toEqual({})
    }
  })
})

describe('SPM-10 — undoing significant edits in the form (withSavedValues)', () => {
  it('puts every significant field back to its saved value and keeps ordinary edits', () => {
    const saved = request()
    const form = toFormValues(saved)
    form.core = { ...form.core, title: 'Edited title', expectedAttendees: '150', durationHours: '9' }
    form.venue = { ...form.venue, layoutPreference: 'banquet', accessibilityRequired: false }
    form.equipment = { ...form.equipment, requirements: 'projector\nmic' }
    form.internal = { planningNotes: 'Edited note' }

    const undone = withSavedValues(form, saved, SIGNIFICANT_FIELDS)
    expect(undone.core).toEqual({ ...toFormValues(saved).core, title: 'Edited title' })
    expect(undone.venue).toEqual(toFormValues(saved).venue)
    expect(undone.equipment).toEqual(toFormValues(saved).equipment)
    expect(undone.internal).toEqual({ planningNotes: 'Edited note' })
  })

  it('ignores sections the form does not hold', () => {
    const saved = request()
    const form = { core: toFormValues(saved).core }
    expect(Object.keys(withSavedValues(form, saved, SIGNIFICANT_FIELDS))).toEqual(['core'])
  })
})
