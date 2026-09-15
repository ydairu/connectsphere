// Phase 4 evidence for SPM-42 and SPM-24, at the pure-predicate level.
//
// Each test is named for the case it exercises and proves one SPM-42 or SPM-24 acceptance criterion
// from docs/requirements/effective-requirements.md. These prove the permission *decision* behind each
// expected outcome; the HTTP status codes (403 / 200) are asserted by the API tests that call these
// same functions, which do not exist yet.
//
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DRAFT,
  SUBMITTED,
  PLANNING,
  CONFIRMED,
  COMPLETED,
  CANCELLED,
  REJECTED,
  RETURNED,
  STATUSES,
} from './status.js'
import {
  ORGANISER,
  COORDINATOR,
  VENUE_STAFF,
  TECHNICAL_STAFF,
  ATTENDEE,
  CORE,
  VENUE,
  EQUIPMENT,
  SECTIONS,
  inScope,
  canEdit,
  projectRequest,
  forbiddenFields,
} from './permissions.js'

// --- fixtures -------------------------------------------------------------------------------------

const ORG_ACME = 'acme-001'
const FINISHED = [COMPLETED, CANCELLED, REJECTED]

const owner = { uid: 'u-owner', roles: [ORGANISER], organisationId: ORG_ACME }
const colleague = { uid: 'u-colleague', roles: [ORGANISER], organisationId: ORG_ACME }
const coordinator = { uid: 'u-coord', roles: [COORDINATOR] }
const venueStaff = { uid: 'u-venue', roles: [VENUE_STAFF] }
const technicalStaff = { uid: 'u-tech', roles: [TECHNICAL_STAFF] }
const dualStaff = { uid: 'u-dual', roles: [VENUE_STAFF, TECHNICAL_STAFF] }
const attendee = { uid: 'u-attendee', roles: [ATTENDEE] }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: SUBMITTED,
    ownerUid: owner.uid,
    organisationId: ORG_ACME,
    organisationName: 'Acme Ltd',
    assignedStaffUids: [venueStaff.uid, dualStaff.uid],
    core: { title: 'Annual Summit', expectedAttendees: 120 },
    venue: { layout: 'theatre', accessible: true },
    equipment: { projector: true },
    registration: { enabled: true },
    internal: { planningNotes: 'Hold Hall B pending AV check' },
    ...overrides,
  }
}

// --- SPM-42: View and Edit Information According to My Role's Permissions -------------------------

describe("SPM-42 — View and Edit Information According to My Role's Permissions", () => {
  test('Attendee requests a draft by direct ID', () => {
    // Registration enabled would otherwise put the event in an attendee's scope; the draft rule wins.
    const draft = request({ status: DRAFT, registration: { enabled: true } })
    assert.equal(inScope(attendee, draft), false)
  })

  test('Organiser PATCHes their own request while it is submitted', () => {
    const submitted = request({ status: SUBMITTED })
    assert.equal(inScope(owner, submitted), true, 'ownership keeps it in scope — the denial is the state gate')
    assert.equal(canEdit(owner, submitted, 'core'), false)
    assert.deepEqual(forbiddenFields(owner, submitted, { core: { title: 'Renamed' } }), ['core.title'])
  })

  test("Organiser opens a colleague's draft in the same organisation", () => {
    const colleaguesDraft = request({ status: DRAFT, ownerUid: colleague.uid })
    assert.equal(inScope(owner, colleaguesDraft), false)
  })

  test('Venue staff PATCHes an equipment field', () => {
    const planning = request({ status: PLANNING })
    const patch = { venue: { layout: 'banquet' }, equipment: { projector: false } }
    assert.deepEqual(forbiddenFields(venueStaff, planning, patch), ['equipment.projector'])
  })

  test('Attendee GETs a confirmed event — body carries no internal fields', () => {
    const body = projectRequest(attendee, request({ status: CONFIRMED }))
    for (const key of ['internal', 'venue', 'equipment', 'registration', 'ownerUid', 'organisationId', 'assignedStaffUids']) {
      assert.equal(Object.hasOwn(body, key), false, `"${key}" must be absent from the body, not merely empty`)
    }
    assert.deepEqual(body.core, { title: 'Annual Summit', expectedAttendees: 120 })
  })

  test('Venue+technical dual-role account PATCHes a venue field and an equipment field', () => {
    const planning = request({ status: PLANNING })
    const patch = { venue: { layout: 'banquet' }, equipment: { projector: false } }
    assert.deepEqual(forbiddenFields(dualStaff, planning, patch), [])
  })

  test('Organiser+venue-staff dual-role account edits its own request while it is in planning', () => {
    // Regression for the multi-role leak — effective-requirements.md, SPM-42: combined permissions are
    // "the union of what each assigned role independently permits, evaluated per role". Every
    // dimension is satisfied by *some* role here: the organiser role has scope (same organisation) and
    // edit rights over core, the venue role has scope (assigned) and an open gate (planning). Combining
    // roles before the gate would unlock core; evaluating per role must not.
    const organiserVenueStaff = { uid: 'u-org-venue', roles: [ORGANISER, VENUE_STAFF], organisationId: ORG_ACME }
    const ownPlanning = request({
      status: PLANNING,
      ownerUid: organiserVenueStaff.uid,
      assignedStaffUids: [organiserVenueStaff.uid],
    })
    assert.equal(canEdit(organiserVenueStaff, ownPlanning, CORE), false, 'the venue role must not unlock core')
    assert.equal(canEdit(organiserVenueStaff, ownPlanning, VENUE), true, 'the venue role still edits venue')
    assert.deepEqual(
      forbiddenFields(organiserVenueStaff, ownPlanning, { core: { title: 'Renamed' }, venue: { layout: 'banquet' } }),
      ['core.title'],
    )
  })

  test('Venue staff GETs an assigned event — equipment section absent', () => {
    // SPM-42: Venue Staff "cannot see the equipment section" — absent from the body, not hidden.
    const body = projectRequest(venueStaff, request({ status: PLANNING, assignedStaffUids: [venueStaff.uid] }))
    assert.equal(Object.hasOwn(body, EQUIPMENT), false, 'equipment must be absent from the body')
    assert.deepEqual(body.venue, { layout: 'theatre', accessible: true })
  })

  test('Technical staff GETs an assigned event — venue section absent', () => {
    // SPM-42: Technical Support Staff "cannot see the venue section" — absent from the body, not hidden.
    const body = projectRequest(technicalStaff, request({ status: PLANNING, assignedStaffUids: [technicalStaff.uid] }))
    assert.equal(Object.hasOwn(body, VENUE), false, 'venue must be absent from the body')
    assert.deepEqual(body.equipment, { projector: true })
  })

  // Finished events are read-only for every role. Proposed by Shaun (14 Sep 2026), pending team
  // ratification — effective-requirements.md, SPM-42 "[Team decision pending]".
  test('Coordinator PATCHes a completed, cancelled or rejected event', () => {
    for (const status of FINISHED) {
      const finished = request({ status })
      assert.deepEqual(forbiddenFields(coordinator, finished, { internal: { planningNotes: 'Late note' } }), ['internal.planningNotes'], status)
      for (const section of SECTIONS) assert.equal(canEdit(coordinator, finished, section), false, `${status}: ${section}`)
    }
    assert.equal(canEdit(coordinator, request({ status: CONFIRMED }), CORE), true, 'confirmed stays editable')
  })

  test('Assigned venue and technical staff PATCH their section on a completed, cancelled or rejected event', () => {
    for (const status of FINISHED) {
      const finished = request({ status, assignedStaffUids: [venueStaff.uid, technicalStaff.uid, dualStaff.uid] })
      assert.equal(canEdit(venueStaff, finished, VENUE), false, `${status}: venue staff`)
      assert.equal(canEdit(technicalStaff, finished, EQUIPMENT), false, `${status}: technical staff`)
      assert.deepEqual(forbiddenFields(dualStaff, finished, { venue: { layout: 'x' }, equipment: { projector: false } }), ['venue.layout', 'equipment.projector'], status)
    }
    const confirmed = request({ status: CONFIRMED, assignedStaffUids: [venueStaff.uid] })
    assert.equal(canEdit(venueStaff, confirmed, VENUE), true, 'confirmed stays editable for assigned staff')
  })

  // Attendees see confirmed events only. Proposed by Shaun (14 Sep 2026), pending team ratification.
  test('Attendee requests an event with registration enabled before it is confirmed or after it has finished', () => {
    for (const status of STATUSES.filter((s) => s !== CONFIRMED)) {
      const notConfirmed = request({ status, registration: { enabled: true } })
      assert.equal(inScope(attendee, notConfirmed), false, status)
      assert.equal(projectRequest(attendee, notConfirmed), null, `${status}: no body at all`)
    }
  })

  test('Organiser edits their own request after it is returned for clarification', () => {
    const returned = request({ status: RETURNED })
    assert.deepEqual(forbiddenFields(owner, returned, { core: { title: 'Clarified title' } }), [])
  })

  test('Coordinator edits a section outside "main details" on an unassigned event', () => {
    // The coordinator is not on the event's assignment list. The plan says not to add a denial test
    // for this: full visibility and full edit is the customer's ruling (Clarification 1 & 2).
    const unassigned = request({ status: PLANNING, assignedStaffUids: [] })
    const patch = { equipment: { projector: false }, internal: { planningNotes: 'Moved to Hall C' } }
    assert.deepEqual(forbiddenFields(coordinator, unassigned, patch), [])
    for (const section of SECTIONS) assert.equal(canEdit(coordinator, unassigned, section), true, section)
  })
})

// --- SPM-24: View My Saved Draft Requests and Distinguish Them from Submitted Requests -------------

describe('SPM-24 — View My Saved Draft Requests and Distinguish Them from Submitted Requests', () => {
  test('Coordinator lists all requests — drafts absent', () => {
    const all = [
      request({ id: 'draft-1', status: DRAFT }),
      request({ id: 'sub-1', status: SUBMITTED }),
      request({ id: 'conf-1', status: CONFIRMED }),
    ]
    const listed = all.filter((r) => inScope(coordinator, r)).map((r) => r.id)
    assert.deepEqual(listed, ['sub-1', 'conf-1'])
  })
})
