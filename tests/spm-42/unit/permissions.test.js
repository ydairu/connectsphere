// Phase 4 evidence for SPM-42 and SPM-24, at the pure-predicate level.
//
// Each test is named for the case it exercises and proves one SPM-42 or SPM-24 acceptance criterion
// from docs/requirements/effective-requirements.md. These prove the permission *decision* behind each
// expected outcome; the HTTP status codes (403 / 200) are asserted by the API tests that call these
// same functions, which do not exist yet.

import { describe, expect, it } from 'vitest'

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
} from '../../../shared/status.js'
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
} from '../../../shared/permissions.js'

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
  it('Attendee requests a draft by direct ID', () => {
    // Registration enabled would otherwise put the event in an attendee's scope; the draft rule wins.
    const draft = request({ status: DRAFT, registration: { enabled: true } })
    expect(inScope(attendee, draft)).toBe(false)
  })

  it('Organiser PATCHes their own request while it is submitted', () => {
    const submitted = request({ status: SUBMITTED })
    expect(inScope(owner, submitted), 'ownership keeps it in scope — the denial is the state gate').toBe(true)
    expect(canEdit(owner, submitted, 'core')).toBe(false)
    expect(forbiddenFields(owner, submitted, { core: { title: 'Renamed' } })).toEqual(['core.title'])
  })

  it('Self-registered organiser views their own submitted request before organisation ID assignment', () => {
    const selfRegisteredOwner = { uid: 'u-self-registered', roles: [ORGANISER], organisationName: 'Named Only Ltd' }
    const ownSubmitted = request({
      status: SUBMITTED,
      ownerUid: selfRegisteredOwner.uid,
      organisationId: null,
      organisationName: selfRegisteredOwner.organisationName,
    })

    expect(inScope(selfRegisteredOwner, ownSubmitted)).toBe(true)
    expect(canEdit(selfRegisteredOwner, ownSubmitted, CORE)).toBe(false)
    expect(projectRequest(selfRegisteredOwner, ownSubmitted)).toEqual({
      id: ownSubmitted.id,
      status: SUBMITTED,
      core: ownSubmitted.core,
      venue: ownSubmitted.venue,
      equipment: ownSubmitted.equipment,
      registration: ownSubmitted.registration,
    })
  })

  it("Organiser opens a colleague's draft in the same organisation", () => {
    const colleaguesDraft = request({ status: DRAFT, ownerUid: colleague.uid })
    expect(inScope(owner, colleaguesDraft)).toBe(false)
  })

  it('Venue staff PATCHes an equipment field', () => {
    const planning = request({ status: PLANNING })
    const patch = { venue: { layout: 'banquet' }, equipment: { projector: false } }
    expect(forbiddenFields(venueStaff, planning, patch)).toEqual(['equipment.projector'])
  })

  it('Attendee GETs a confirmed event — body carries no internal fields', () => {
    const body = projectRequest(attendee, request({ status: CONFIRMED }))
    for (const key of ['internal', 'venue', 'equipment', 'registration', 'ownerUid', 'organisationId', 'assignedStaffUids']) {
      expect(Object.hasOwn(body, key), `"${key}" must be absent from the body, not merely empty`).toBe(false)
    }
    expect(body.core).toEqual({ title: 'Annual Summit', expectedAttendees: 120 })
  })

  it('Venue+technical dual-role account PATCHes a venue field and an equipment field', () => {
    const planning = request({ status: PLANNING })
    const patch = { venue: { layout: 'banquet' }, equipment: { projector: false } }
    expect(forbiddenFields(dualStaff, planning, patch)).toEqual([])
  })

  it('Organiser+venue-staff dual-role account edits its own request while it is in planning', () => {
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
    expect(canEdit(organiserVenueStaff, ownPlanning, CORE), 'the venue role must not unlock core').toBe(false)
    expect(canEdit(organiserVenueStaff, ownPlanning, VENUE), 'the venue role still edits venue').toBe(true)
    expect(forbiddenFields(organiserVenueStaff, ownPlanning, { core: { title: 'Renamed' }, venue: { layout: 'banquet' } })).toEqual(['core.title'])
  })

  it('Venue staff GETs an assigned event — equipment section absent', () => {
    // SPM-42: Venue Staff "cannot see the equipment section" — absent from the body, not hidden.
    const body = projectRequest(venueStaff, request({ status: PLANNING, assignedStaffUids: [venueStaff.uid] }))
    expect(Object.hasOwn(body, EQUIPMENT), 'equipment must be absent from the body').toBe(false)
    expect(body.venue).toEqual({ layout: 'theatre', accessible: true })
  })

  it('Technical staff GETs an assigned event — venue section absent', () => {
    // SPM-42: Technical Support Staff "cannot see the venue section" — absent from the body, not hidden.
    const body = projectRequest(technicalStaff, request({ status: PLANNING, assignedStaffUids: [technicalStaff.uid] }))
    expect(Object.hasOwn(body, VENUE), 'venue must be absent from the body').toBe(false)
    expect(body.equipment).toEqual({ projector: true })
  })

  // Finished events are read-only for every role. Team decision, proposed by Shaun (14 Sep 2026) and
  // ratified 20 Sep 2026 — effective-requirements.md, SPM-42 "[Team decision]".
  it('Coordinator PATCHes a completed, cancelled or rejected event', () => {
    for (const status of FINISHED) {
      const finished = request({ status })
      expect(forbiddenFields(coordinator, finished, { internal: { planningNotes: 'Late note' } }), status).toEqual(['internal.planningNotes'])
      for (const section of SECTIONS) expect(canEdit(coordinator, finished, section), `${status}: ${section}`).toBe(false)
    }
    expect(canEdit(coordinator, request({ status: CONFIRMED }), CORE), 'confirmed stays editable').toBe(true)
  })

  it('Assigned venue and technical staff PATCH their section on a completed, cancelled or rejected event', () => {
    for (const status of FINISHED) {
      const finished = request({ status, assignedStaffUids: [venueStaff.uid, technicalStaff.uid, dualStaff.uid] })
      expect(canEdit(venueStaff, finished, VENUE), `${status}: venue staff`).toBe(false)
      expect(canEdit(technicalStaff, finished, EQUIPMENT), `${status}: technical staff`).toBe(false)
      expect(forbiddenFields(dualStaff, finished, { venue: { layout: 'x' }, equipment: { projector: false } }), status).toEqual(['venue.layout', 'equipment.projector'])
    }
    const confirmed = request({ status: CONFIRMED, assignedStaffUids: [venueStaff.uid] })
    expect(canEdit(venueStaff, confirmed, VENUE), 'confirmed stays editable for assigned staff').toBe(true)
  })

  // Attendees see confirmed events only. Team decision, proposed by Shaun (14 Sep 2026) and ratified
  // 20 Sep 2026.
  it('Attendee requests an event with registration enabled before it is confirmed or after it has finished', () => {
    for (const status of STATUSES.filter((s) => s !== CONFIRMED)) {
      const notConfirmed = request({ status, registration: { enabled: true } })
      expect(inScope(attendee, notConfirmed), status).toBe(false)
      expect(projectRequest(attendee, notConfirmed), `${status}: no body at all`).toBe(null)
    }
  })

  it('Organiser edits their own request after it is returned for clarification', () => {
    const returned = request({ status: RETURNED })
    expect(forbiddenFields(owner, returned, { core: { title: 'Clarified title' } })).toEqual([])
  })

  it('Coordinator edits a section outside "main details" on an unassigned event', () => {
    // The coordinator is not on the event's assignment list. The plan says not to add a denial test
    // for this: full visibility and full edit is the customer's ruling (Clarification 1 & 2).
    const unassigned = request({ status: PLANNING, assignedStaffUids: [] })
    const patch = { equipment: { projector: false }, internal: { planningNotes: 'Moved to Hall C' } }
    expect(forbiddenFields(coordinator, unassigned, patch)).toEqual([])
    for (const section of SECTIONS) expect(canEdit(coordinator, unassigned, section), section).toBe(true)
  })
})

// --- SPM-24: View My Saved Draft Requests and Distinguish Them from Submitted Requests -------------

describe('SPM-24 — View My Saved Draft Requests and Distinguish Them from Submitted Requests', () => {
  it('Coordinator lists all requests — drafts absent', () => {
    const all = [
      request({ id: 'draft-1', status: DRAFT }),
      request({ id: 'sub-1', status: SUBMITTED }),
      request({ id: 'conf-1', status: CONFIRMED }),
    ]
    const listed = all.filter((r) => inScope(coordinator, r)).map((r) => r.id)
    expect(listed).toEqual(['sub-1', 'conf-1'])
  })
})
