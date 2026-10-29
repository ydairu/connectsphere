// SPM-66 — the Safety Officer role and what it may see, at the pure-function level (shared/permissions.js,
// shared/changeHistory.js, shared/safetyReview.js). The API suite is tests/spm-92/integration/safetyReviewApi.test.js.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { canViewChangeHistory, visibleChangeHistory } from '../../../shared/changeHistory.js'
import {
  COORDINATOR,
  ORGANISER,
  ROLES,
  SAFETY_OFFICER,
  SECTIONS,
  canEdit,
  editableSectionsFor,
  forbiddenFields,
  inScope,
  projectRequest,
  viewableSectionsFor,
} from '../../../shared/permissions.js'
import {
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_INVALIDATED,
  SAFETY_REJECTED,
  SAFETY_REVIEW_PENDING,
  canViewSafetyVenueDetails,
} from '../../../shared/safetyReview.js'
import { CANCELLED, CONFIRMED, DRAFT, PLANNING, PREPARATION, REJECTED } from '../../../shared/status.js'

const officer = { uid: 'safety-1', roles: [SAFETY_OFFICER] }

function event(overrides = {}) {
  return {
    id: 'event-1',
    status: PLANNING,
    ownerUid: 'organiser-1',
    organisationId: 'org-a',
    assignedCoordinatorUid: 'coord-1',
    assignedStaffUids: ['venue-1'],
    core: { title: 'Forum', expectedAttendees: 120, preferredDateTime: '2026-12-01T09:00:00.000Z', durationHours: 3 },
    venue: { layoutPreference: 'Theatre', accessibilityRequired: true, accessibilityNeeds: 'Step-free access' },
    equipment: { requirements: ['Projector'], technicalSupportNeeded: true },
    registration: { enabled: false },
    internal: { planningNotes: 'Internal only' },
    safetyReview: { status: SAFETY_REVIEW_PENDING, submittedAt: '2026-10-20T00:00:00.000Z', submittedByUid: 'coord-1' },
    ...overrides,
  }
}

describe('SPM-66 AC1, AC4 — a new internal role defined in system defaults', () => {
  it('Safety Officer is a role, and the seed provisions one Safety Officer account', () => {
    expect(ROLES).toContain(SAFETY_OFFICER)
    const officers = Object.values(SEED_ACCOUNTS).filter((account) => account.roles.includes(SAFETY_OFFICER))
    expect(officers).toHaveLength(1)
    expect(officers[0].roles).toEqual([SAFETY_OFFICER])
  })

  // Self-registration is limited by firestore.rules to organiser and attendee; that file is checked statically
  // by tests/spm-2/integration/firestoreRules.static.test.js. This only guards the role value.
  it('the role value is not one of the self-registration roles', () => {
    expect([ORGANISER, 'attendee']).not.toContain(SAFETY_OFFICER)
  })
})

describe('SPM-66 AC5 — events reach the Safety Officer only through the safety-review queue', () => {
  it('a queued event in Planning is in scope', () => {
    expect(inScope(officer, event())).toBe(true)
  })

  it('an event that is not awaiting review is out of scope, whatever its status', () => {
    for (const status of [SAFETY_APPROVED, SAFETY_CHANGES_REQUESTED, SAFETY_REJECTED, SAFETY_INVALIDATED]) {
      expect(inScope(officer, event({ safetyReview: { status } })), status).toBe(false)
    }
    expect(inScope(officer, event({ safetyReview: undefined }))).toBe(false)
    // A pending review on an event that has moved on or closed is no longer in the queue.
    for (const status of [PREPARATION, DRAFT, CANCELLED, REJECTED]) {
      expect(inScope(officer, event({ status })), status).toBe(false)
    }
    // [Team decision pending] A Confirmed event submitted because it predates SPM-91 is in the queue.
    expect(inScope(officer, event({ status: CONFIRMED }))).toBe(true)
  })

  it('out of scope means nothing is projected', () => {
    expect(projectRequest(officer, event({ safetyReview: { status: SAFETY_APPROVED } }))).toBeNull()
  })
})

describe('SPM-66 AC2, AC3 — what the Safety Officer sees, and that they cannot edit', () => {
  it('sees attendance, layout, accessibility and equipment, and nothing internal', () => {
    expect(viewableSectionsFor(officer, event())).toEqual(['core', 'venue', 'equipment'])
    const body = projectRequest(officer, event())
    expect(body.core.expectedAttendees).toBe(120)
    expect(body.venue).toMatchObject({ layoutPreference: 'Theatre', accessibilityNeeds: 'Step-free access' })
    expect(body.equipment.requirements).toEqual(['Projector'])
    expect(body.internal).toBeUndefined()
    expect(body.registration).toBeUndefined()
    // Record metadata is internal: no owner, staff or review internals in the projection.
    expect(body.ownerUid).toBeUndefined()
    expect(body.safetyReview).toBeUndefined()
  })

  it('may not edit any section', () => {
    expect(editableSectionsFor(officer, event())).toEqual([])
    for (const section of SECTIONS) expect(canEdit(officer, event(), section), section).toBe(false)
    expect(forbiddenFields(officer, event(), { core: { expectedAttendees: 10 } })).toEqual(['core.expectedAttendees'])
  })

  it('may read the booked venues’ safety details for a queued event only', () => {
    expect(canViewSafetyVenueDetails(officer, event())).toBe(true)
    expect(canViewSafetyVenueDetails(officer, event({ safetyReview: { status: SAFETY_APPROVED } }))).toBe(false)
  })

  it('the role adds nothing to a Coordinator’s scope on another Coordinator’s event (union per role)', () => {
    const dual = { uid: 'dual-1', roles: [COORDINATOR, SAFETY_OFFICER] }
    expect(editableSectionsFor(dual, event())).toEqual([])
    expect(viewableSectionsFor(dual, event())).toEqual(['core', 'venue', 'equipment'])
  })
})

describe('SPM-66 AC6 — change history for attendance, venue/layout, access and equipment', () => {
  const entries = [
    { id: 'a', type: 'field_changed', field: 'core.expectedAttendees', oldValue: 80, newValue: 120, actor: { uid: 'coord-1', name: 'C', role: COORDINATOR }, at: '2026-10-01T00:00:00Z' },
    { id: 'b', type: 'field_changed', field: 'core.title', oldValue: 'Old', newValue: 'Forum', actor: { uid: 'coord-1', name: 'C', role: COORDINATOR }, at: '2026-10-02T00:00:00Z' },
    { id: 'c', type: 'field_changed', field: 'venue.layoutPreference', oldValue: 'Banquet', newValue: 'Theatre', actor: { uid: 'coord-1' }, at: '2026-10-03T00:00:00Z' },
    { id: 'd', type: 'field_changed', field: 'venue.accessibilityNeeds', oldValue: '', newValue: 'Step-free access', actor: { uid: 'coord-1' }, at: '2026-10-04T00:00:00Z' },
    { id: 'e', type: 'field_changed', field: 'equipment.requirements', oldValue: [], newValue: ['Projector'], actor: { uid: 'coord-1' }, at: '2026-10-05T00:00:00Z' },
    { id: 'f', type: 'field_changed', field: 'internal.planningNotes', oldValue: '', newValue: 'Internal only', actor: { uid: 'coord-1' }, at: '2026-10-06T00:00:00Z' },
    { id: 'g', type: 'field_changed', field: 'venuePreparation.status', oldValue: 'not_started', newValue: 'in_progress', actor: { uid: 'venue-1' }, at: '2026-10-07T00:00:00Z' },
  ]

  it('a queued event’s history shows only those fields, newest first, without actor uids', () => {
    expect(canViewChangeHistory(officer, event())).toBe(true)
    const visible = visibleChangeHistory(officer, event(), entries)
    expect(visible.map((entry) => entry.id)).toEqual(['e', 'd', 'c', 'a'])
    for (const entry of visible) expect(entry.actor.uid).toBeUndefined()
  })

  it('no history once the event has left the queue', () => {
    const decided = event({ safetyReview: { status: SAFETY_APPROVED } })
    expect(canViewChangeHistory(officer, decided)).toBe(false)
    expect(visibleChangeHistory(officer, decided, entries)).toBeNull()
  })
})
