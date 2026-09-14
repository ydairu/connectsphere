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

import { DRAFT, SUBMITTED, PLANNING, CONFIRMED, RETURNED } from './status.js'
import {
  ORGANISER,
  COORDINATOR,
  VENUE_STAFF,
  TECHNICAL_STAFF,
  ATTENDEE,
  SECTIONS,
  inScope,
  canEdit,
  projectRequest,
  forbiddenFields,
} from './permissions.js'

// --- fixtures -------------------------------------------------------------------------------------

const ORG_ACME = 'acme-001'

const owner = { uid: 'u-owner', roles: [ORGANISER], organisationId: ORG_ACME }
const colleague = { uid: 'u-colleague', roles: [ORGANISER], organisationId: ORG_ACME }
const coordinator = { uid: 'u-coord', roles: [COORDINATOR] }
const venueStaff = { uid: 'u-venue', roles: [VENUE_STAFF] }
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
