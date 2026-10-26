// SPM-48 unit suite — the preparation rules (shared/preparation.js), how shared/permissions.js applies
// them, what the page is told (shared/preparationAccess.js), and the SPM-28 history filter
// (shared/changeHistory.js). Pure functions.

import { describe, expect, it } from 'vitest'

import { FIELD_CHANGED, historyEntriesForEdit, visibleChangeHistory } from '../../../shared/changeHistory.js'
import {
  ATTENDEE,
  COORDINATOR,
  CORE,
  EQUIPMENT,
  EQUIPMENT_PREPARATION,
  ORGANISER,
  TECHNICAL_STAFF,
  VENUE,
  VENUE_PREPARATION,
  VENUE_STAFF,
  canEdit,
  forbiddenFields,
  projectRequest,
} from '../../../shared/permissions.js'
import {
  DEFAULT_PREPARATION,
  PREPARATION_EVENT_CLOSED,
  PREPARATION_NOTES_MAX_LENGTH,
  PREPARATION_NOT_STARTED_YET,
  PREPARATION_STATUSES,
  PREPARATION_STATUS_LABELS,
  canUpdateEquipmentPreparation,
  canUpdateVenuePreparation,
  preparationPatchErrors,
  preparationReadOnlyReason,
  preparationSection,
  preparationShown,
} from '../../../shared/preparation.js'
import { preparationEditing } from '../../../shared/preparationAccess.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  PREPARATION,
  REJECTED,
  RETURNED,
  STATUSES,
  SUBMITTED,
  UNDER_REVIEW,
} from '../../../shared/status.js'

const owner = { uid: 'org-1', name: 'Owner', roles: [ORGANISER], organisationId: 'ORG-A' }
const colleague = { uid: 'org-2', name: 'Colleague', roles: [ORGANISER], organisationId: 'ORG-A' }
const coordinator = { uid: 'coord-1', name: 'Coordinator', roles: [COORDINATOR] }
const venue = { uid: 'venue-1', name: 'Venue', roles: [VENUE_STAFF] }
const technical = { uid: 'tech-1', name: 'Tech', roles: [TECHNICAL_STAFF] }
const both = { uid: 'both-1', name: 'Both', roles: [VENUE_STAFF, TECHNICAL_STAFF] }
const unassignedVenue = { uid: 'venue-2', name: 'Other venue', roles: [VENUE_STAFF] }
const attendee = { uid: 'att-1', name: 'Attendee', roles: [ATTENDEE] }

const decision = (value) => (value ? { decision: value } : undefined)

function request({ status = PREPARATION, venueDecision = 'approved', technicalDecision = 'approved', reserved = true, ...overrides } = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    organisationId: 'ORG-A',
    assignedStaffUids: [venue.uid, technical.uid, both.uid],
    assignedCoordinatorUid: coordinator.uid,
    arrangementApprovals: { venue: decision(venueDecision), technical: decision(technicalDecision) },
    core: { title: 'Launch' },
    venue: { layoutPreference: 'theatre' },
    equipment: { requirements: ['projector'], technicalSupportNeeded: true },
    registration: { enabled: true },
    internal: { planningNotes: 'Hold Hall B' },
    ...(reserved ? { reservedEquipment: { equipmentRequestId: 'eq-1', items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 1 }] } } : {}),
    ...overrides,
  }
}

describe('SPM-48 AC2 — status values and defaults', () => {
  it('the three statuses, in order, with their labels', () => {
    expect(PREPARATION_STATUSES).toEqual(['not_started', 'in_progress', 'ready'])
    expect(PREPARATION_STATUSES.map((status) => PREPARATION_STATUS_LABELS[status])).toEqual(['Not Started', 'In Progress', 'Ready'])
  })

  it('a missing section reads as Not Started with empty notes; stored values win', () => {
    expect(DEFAULT_PREPARATION).toEqual({ status: 'not_started', notes: '' })
    expect(preparationSection(request(), VENUE_PREPARATION)).toEqual({ status: 'not_started', notes: '' })
    expect(preparationSection(request({ venuePreparation: { notes: 'x' } }), VENUE_PREPARATION)).toEqual({ status: 'not_started', notes: 'x' })
    expect(preparationSection(request({ venuePreparation: null }), VENUE_PREPARATION)).toEqual(DEFAULT_PREPARATION)
  })
})

describe('SPM-88 — preparation editing follows status only', () => {
  const SIGN_OFFS = [['approved', true], ['rejected', false], [null, false]]

  for (const status of STATUSES) {
    for (const [value, approved] of SIGN_OFFS) {
      const expected = status === PREPARATION
      it(`${status}, sign-off ${value ?? 'not decided'}: ${expected ? 'may' : 'may not'} update`, () => {
        expect(canUpdateVenuePreparation(request({ status, venueDecision: value, technicalDecision: 'approved' }))).toBe(expected)
        expect(canUpdateEquipmentPreparation(request({ status, reserved: approved, technicalDecision: null }))).toBe(expected)
      })
    }
  }

  it('neither section uses the old sign-off or reservation condition', () => {
    const venueOnly = request({ venueDecision: 'approved', technicalDecision: 'approved', reserved: false })
    expect(canUpdateVenuePreparation(venueOnly)).toBe(true)
    expect(canUpdateEquipmentPreparation(venueOnly)).toBe(true)
  })

  it('Planning and Confirmed stay read-only even with approved arrangements', () => {
    expect(canUpdateVenuePreparation({ status: PLANNING })).toBe(false)
    expect(canUpdateEquipmentPreparation({ status: CONFIRMED })).toBe(false)
  })

  it('read-only reasons follow the same conditions', () => {
    expect(preparationReadOnlyReason(VENUE_PREPARATION, request())).toBeNull()
    expect(preparationReadOnlyReason(VENUE_PREPARATION, request({ status: PLANNING }))).toBe(PREPARATION_NOT_STARTED_YET)
    expect(preparationReadOnlyReason(EQUIPMENT_PREPARATION, request({ status: CONFIRMED, reserved: false }))).toBe(PREPARATION_NOT_STARTED_YET)
    for (const status of [COMPLETED, CANCELLED, REJECTED]) {
      expect(preparationReadOnlyReason(VENUE_PREPARATION, request({ status })), status).toBe(PREPARATION_EVENT_CLOSED)
    }
    expect(preparationReadOnlyReason(VENUE_PREPARATION, request({ status: UNDER_REVIEW }))).toBe(PREPARATION_NOT_STARTED_YET)
    expect(preparationReadOnlyReason(CORE, request())).toBeNull()
  })

  it('[Team decision] shown from Planning onwards, closed statuses included', () => {
    const shown = STATUSES.filter((status) => preparationShown({ status }))
    expect(shown.sort()).toEqual([CANCELLED, COMPLETED, CONFIRMED, PLANNING, PREPARATION, REJECTED].sort())
  })
})

describe('SPM-48 AC1/AC6/AC7 — who may edit which section (shared/permissions.js)', () => {
  it('Venue Staff edit venue preparation only', () => {
    const approved = request()
    expect(canEdit(venue, approved, VENUE_PREPARATION)).toBe(true)
    for (const section of [CORE, VENUE, EQUIPMENT, EQUIPMENT_PREPARATION]) expect(canEdit(venue, approved, section), section).toBe(false)
  })

  it('Technical Support Staff edit equipment preparation only', () => {
    const approved = request()
    expect(canEdit(technical, approved, EQUIPMENT_PREPARATION)).toBe(true)
    for (const section of [CORE, VENUE, EQUIPMENT, VENUE_PREPARATION]) expect(canEdit(technical, approved, section), section).toBe(false)
  })

  it('a staff member holding both roles edits both preparation sections, and still not the requested venue or equipment', () => {
    expect(forbiddenFields(both, request(), {
      venuePreparation: { status: 'ready' },
      equipmentPreparation: { status: 'ready' },
      venue: { layoutPreference: 'banquet' },
      equipment: { requirements: [] },
    })).toEqual(['venue.layoutPreference', 'equipment.requirements'])
  })

  it('staff not assigned to the event edit nothing', () => {
    expect(canEdit(unassignedVenue, request(), VENUE_PREPARATION)).toBe(false)
  })

  it('the assigned Coordinator edits neither preparation section, but still edits the requested venue and equipment', () => {
    expect(canEdit(coordinator, request(), VENUE_PREPARATION)).toBe(false)
    expect(canEdit(coordinator, request(), EQUIPMENT_PREPARATION)).toBe(false)
    expect(canEdit(coordinator, request(), VENUE)).toBe(true)
    expect(canEdit(coordinator, request(), EQUIPMENT)).toBe(true)
  })

  it('the status condition applies to the staff role before Preparation', () => {
    expect(forbiddenFields(venue, request({ status: CONFIRMED }), { venuePreparation: { status: 'ready' } })).toEqual(['venuePreparation.status'])
  })
})

describe('SPM-48 AC8 — preparation is projected out for Organisers and Attendees', () => {
  const withPreparation = request({ status: CONFIRMED, registration: { enabled: true }, venuePreparation: { status: 'ready', notes: 'n' } })

  it.each([['owner', owner], ['colleague', colleague], ['attendee', attendee]])('%s: absent from the body', (_label, user) => {
    const body = projectRequest(user, withPreparation)
    expect(body).not.toBeNull()
    expect(body).not.toHaveProperty(VENUE_PREPARATION)
    expect(body).not.toHaveProperty(EQUIPMENT_PREPARATION)
  })

  it('Venue Staff receive venue preparation only; Technical Support Staff equipment preparation only', () => {
    expect(projectRequest(venue, withPreparation)).toHaveProperty(VENUE_PREPARATION, { status: 'ready', notes: 'n' })
    expect(projectRequest(venue, withPreparation)).not.toHaveProperty(EQUIPMENT_PREPARATION)
    expect(projectRequest(technical, withPreparation)).toHaveProperty(EQUIPMENT_PREPARATION, DEFAULT_PREPARATION)
    expect(projectRequest(technical, withPreparation)).not.toHaveProperty(VENUE_PREPARATION)
  })

  it('the Coordinator receives both; before Planning, nobody receives either', () => {
    expect(projectRequest(coordinator, withPreparation)).toHaveProperty(VENUE_PREPARATION)
    expect(projectRequest(coordinator, withPreparation)).toHaveProperty(EQUIPMENT_PREPARATION)
    for (const status of [SUBMITTED, UNDER_REVIEW, RETURNED]) {
      expect(projectRequest(coordinator, request({ status })), status).not.toHaveProperty(VENUE_PREPARATION)
    }
    expect(projectRequest(owner, request({ status: DRAFT }))).not.toHaveProperty(VENUE_PREPARATION)
  })
})

describe('SPM-48 — what the page is told (preparationEditing)', () => {
  it('each staff role gets its own section, editable or with the reason', () => {
    expect(preparationEditing(venue, request())).toEqual({ venuePreparation: { editable: true, readOnlyReason: null } })
    expect(preparationEditing(technical, request({ status: CONFIRMED, reserved: false }))).toEqual({
      equipmentPreparation: { editable: false, readOnlyReason: PREPARATION_NOT_STARTED_YET },
    })
    expect(preparationEditing(both, request({ status: COMPLETED }))).toEqual({
      venuePreparation: { editable: false, readOnlyReason: PREPARATION_EVENT_CLOSED },
      equipmentPreparation: { editable: false, readOnlyReason: PREPARATION_EVENT_CLOSED },
    })
  })

  it('nothing for the Coordinator, Organisers, Attendees, unassigned staff, or before Planning', () => {
    for (const user of [coordinator, owner, colleague, attendee, unassignedVenue]) expect(preparationEditing(user, request({ status: CONFIRMED }))).toBeNull()
    expect(preparationEditing(venue, request({ status: UNDER_REVIEW }))).toBeNull()
  })
})

describe('SPM-48 — validation of preparation values', () => {
  it('valid statuses and notes, and patches without preparation, have no errors', () => {
    for (const status of PREPARATION_STATUSES) expect(preparationPatchErrors({ venuePreparation: { status } })).toEqual({})
    expect(preparationPatchErrors({ equipmentPreparation: { notes: '' } })).toEqual({})
    expect(preparationPatchErrors({ equipmentPreparation: { notes: 'x'.repeat(PREPARATION_NOTES_MAX_LENGTH) } })).toEqual({})
    expect(preparationPatchErrors({ core: { title: 42 } }), 'other sections are not validated (SPM-10)').toEqual({})
  })

  it('names each invalid field', () => {
    expect(preparationPatchErrors({
      venuePreparation: { status: 'Ready', notes: null },
      equipmentPreparation: { notes: 'x'.repeat(PREPARATION_NOTES_MAX_LENGTH + 1), owner: 'me' },
    })).toEqual({
      'venuePreparation.status': expect.any(String),
      'venuePreparation.notes': 'Must be text.',
      'equipmentPreparation.notes': `Must be ${PREPARATION_NOTES_MAX_LENGTH} characters or fewer.`,
      'equipmentPreparation.owner': 'Unknown field.',
    })
  })

  it('a section that is not an object of fields is an error', () => {
    expect(preparationPatchErrors({ venuePreparation: 'ready' })).toEqual({ venuePreparation: expect.any(String) })
    expect(preparationPatchErrors({ venuePreparation: ['ready'] })).toEqual({ venuePreparation: expect.any(String) })
  })
})

describe('SPM-48 AC9 — history entries, and the SPM-28 filter for Organisers', () => {
  it('a first edit records the change from the default values', () => {
    const before = request()
    const after = { ...before, venuePreparation: { status: 'in_progress' } }
    expect(historyEntriesForEdit(venue, before, after)).toEqual([
      expect.objectContaining({ type: FIELD_CHANGED, field: 'venuePreparation.status', oldValue: 'not_started', newValue: 'in_progress', actor: expect.objectContaining({ uid: venue.uid, role: VENUE_STAFF }) }),
    ])
  })

  it('an edit that does not touch preparation records no preparation entry', () => {
    const before = request()
    expect(historyEntriesForEdit(coordinator, before, { ...before, core: { title: 'New' } }).map((entry) => entry.field)).toEqual(['core.title'])
  })

  const entries = [
    { id: 'e1', type: FIELD_CHANGED, field: 'core.title', oldValue: 'a', newValue: 'b', actor: { type: 'user', uid: coordinator.uid, name: 'Coordinator', role: COORDINATOR }, at: '2026-10-01T10:00:00.000Z' },
    { id: 'e2', type: FIELD_CHANGED, field: 'venuePreparation.status', oldValue: 'not_started', newValue: 'ready', actor: { type: 'user', uid: venue.uid, name: 'Venue', role: VENUE_STAFF }, at: '2026-10-02T10:00:00.000Z' },
    { id: 'e3', type: FIELD_CHANGED, field: 'equipmentPreparation.notes', oldValue: '', newValue: 'Tested', actor: { type: 'user', uid: technical.uid, name: 'Tech', role: TECHNICAL_STAFF }, at: '2026-10-03T10:00:00.000Z' },
    { id: 'e4', type: FIELD_CHANGED, field: 'internal.planningNotes', oldValue: '', newValue: 'n', actor: { type: 'user', uid: coordinator.uid, name: 'Coordinator', role: COORDINATOR }, at: '2026-10-04T10:00:00.000Z' },
  ]

  it('the owning Organiser sees neither preparation section nor internal planning', () => {
    expect(visibleChangeHistory(owner, request(), entries).map((entry) => entry.field)).toEqual(['core.title'])
  })

  it('the assigned Coordinator sees every entry', () => {
    expect(visibleChangeHistory(coordinator, request(), entries).map((entry) => entry.field)).toEqual([
      'internal.planningNotes', 'equipmentPreparation.notes', 'venuePreparation.status', 'core.title',
    ])
  })
})
