// Seed data for SPM-42 / SPM-24 demonstration. Pure data — no Firebase — so seedData.test.js can prove
// offline, with shared/permissions.js, that every rule the seed exists to demonstrate is demonstrable.
//
// Why a seed is a requirement, not scaffolding: internal staff accounts are "pre-populated" from the
// customer's staff sheet, not self-registered (Clarification 2, transcript; effective-requirements.md,
// Roles and Accounts). The staff sheet itself is not in the repository, so the accounts below stand in
// for its rows.
//
// Identification: every seeded Auth user and document has an ID starting with `seed-` and carries
// `seedTag: SEED_TAG`. Remove seeded data by that tag and prefix — never by name or email.
//
// Field names inside sections are provisional: the event-request model belongs to SPM-7.

import {
  ATTENDEE,
  COORDINATOR,
  ORGANISER,
  TECHNICAL_STAFF,
  VENUE_STAFF,
} from '../../shared/permissions.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  REJECTED,
  RETURNED,
  SUBMITTED,
  UNDER_REVIEW,
} from '../../shared/status.js'

export const SEED_TAG = 'spm42-spm24-sprint1'
export const SEED_ID_PREFIX = 'seed-'
export const EVENT_REQUESTS_COLLECTION = 'eventRequests'

// `.test` is reserved (RFC 6761) and never resolves, so no seeded address can reach a real inbox.
const EMAIL_DOMAIN = 'seed.connectsphere.test'

// Fictional companies. The format of a real company ID was never specified by the customer.
export const SEED_ORGANISATIONS = Object.freeze({
  A: { organisationId: 'SEED-ORG-A', organisationName: 'Seed Organisation A' },
  B: { organisationId: 'SEED-ORG-B', organisationName: 'Seed Organisation B' },
})

function account(slug, name, roles, organisation) {
  return {
    uid: `${SEED_ID_PREFIX}${slug}`,
    email: `${slug}@${EMAIL_DOMAIN}`,
    name,
    roles,
    ...(organisation ?? {}),
  }
}

export const SEED_ACCOUNTS = Object.freeze({
  coordinator: account('coordinator', 'Seed Coordinator', [COORDINATOR]),
  // SPM-8: a second coordinator, so workload-based assignment has more than one candidate to choose from.
  coordinator2: account('coordinator-2', 'Seed Coordinator 2', [COORDINATOR]),
  // SPM-8: a third coordinator, so the seed spreads active work across three different workloads and the
  // next submission visibly goes to the one with the fewest. Seeded workloads: 4, 2 and 1 (see SEED_REQUESTS).
  coordinator3: account('coordinator-3', 'Seed Coordinator 3', [COORDINATOR]),
  venueStaff: account('venue-staff', 'Seed Venue Staff', [VENUE_STAFF]),
  technicalStaff: account('technical-staff', 'Seed Technical Staff', [TECHNICAL_STAFF]),
  // SPM-42 combined-permissions criterion: one account, two staff roles.
  venueTechnicalStaff: account('venue-technical-staff', 'Seed Venue + Technical Staff', [VENUE_STAFF, TECHNICAL_STAFF]),
  attendee: account('attendee', 'Seed Attendee', [ATTENDEE]),
  // Organisation A has three organisers. A1 and A2 demonstrate organisation scoping plus the
  // colleague-views-but-cannot-edit rule; A3 is below.
  organiserA1: account('organiser-a1', 'Seed Organiser A1', [ORGANISER], SEED_ORGANISATIONS.A),
  organiserA2: account('organiser-a2', 'Seed Organiser A2', [ORGANISER], SEED_ORGANISATIONS.A),
  organiserB1: account('organiser-b1', 'Seed Organiser B1', [ORGANISER], SEED_ORGANISATIONS.B),
  // SPM-24: "an Organiser with no saved drafts is told so rather than shown a blank screen". Owns nothing.
  organiserA3: account('organiser-a3', 'Seed Organiser A3', [ORGANISER], SEED_ORGANISATIONS.A),
})

const { coordinator, coordinator2, coordinator3, venueStaff, technicalStaff, venueTechnicalStaff, organiserA1, organiserA2, organiserB1 } = SEED_ACCOUNTS

// `coordinator` is set on every non-draft request: a submitted event is always assigned exactly one
// Coordinator (Clarification 1, Coordinator and Staff Assignment). Drafts carry no assignment field.
function eventRequest({ slug, status, owner, title, coordinator, assigned = [], registrationEnabled = false, draft = false, draftCore = {}, createdAt }) {
  const core = draft
    ? { title, purpose: null, description: null, preferredDateTime: null, durationHours: null, expectedAttendees: null, ...draftCore }
    : {
        title,
        purpose: `Seeded ${status} request for permission demonstrations`,
        description: 'Seed data — safe to delete by seedTag.',
        preferredDateTime: '2026-11-20T09:00:00+08:00',
        durationHours: 4,
        expectedAttendees: 80,
      }
  return {
    id: `${SEED_ID_PREFIX}req-${slug}`,
    status,
    ownerUid: owner.uid,
    organisationId: owner.organisationId,
    organisationName: owner.organisationName,
    assignedStaffUids: assigned.map((staff) => staff.uid),
    ...(coordinator ? { assignedCoordinatorUid: coordinator.uid } : {}),
    core,
    venue: { layoutPreference: draft ? null : 'theatre', accessibilityRequired: !draft },
    equipment: { requirements: draft ? [] : ['projector', 'wireless microphone'], technicalSupportNeeded: !draft },
    registration: { enabled: registrationEnabled },
    internal: { planningNotes: draft ? '' : `Seed internal note (${status}) — must never reach an attendee.` },
    createdAt,
  }
}

const bothStaffTeams = [venueStaff, technicalStaff, venueTechnicalStaff]

export const SEED_REQUESTS = Object.freeze([
  // Organisation A, organiser A1 — one request in every status.
  // SPM-8 workloads (active = Submitted, Under Review, Returned, Planning, Confirmed): coordinator 4,
  // coordinator-2 2, coordinator-3 1. Finished requests are assigned too, but do not count.
  eventRequest({ slug: 'a1-draft', status: DRAFT, owner: organiserA1, title: 'A1 draft (private to A1)', draft: true, createdAt: '2026-09-01T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-submitted', coordinator, status: SUBMITTED, owner: organiserA1, title: 'A1 submitted', createdAt: '2026-09-02T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-under-review', coordinator, status: UNDER_REVIEW, owner: organiserA1, title: 'A1 under review', createdAt: '2026-09-03T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-returned', coordinator, status: RETURNED, owner: organiserA1, title: 'A1 returned for clarification', createdAt: '2026-09-04T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-planning', coordinator, status: PLANNING, owner: organiserA1, title: 'A1 planning (all staff assigned)', assigned: bothStaffTeams, createdAt: '2026-09-05T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-confirmed', coordinator: coordinator3, status: CONFIRMED, owner: organiserA1, title: 'A1 confirmed (registration open)', assigned: bothStaffTeams, registrationEnabled: true, createdAt: '2026-09-06T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-completed', coordinator, status: COMPLETED, owner: organiserA1, title: 'A1 completed', assigned: bothStaffTeams, createdAt: '2026-09-07T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-cancelled', coordinator: coordinator2, status: CANCELLED, owner: organiserA1, title: 'A1 cancelled', assigned: bothStaffTeams, createdAt: '2026-09-08T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-rejected', coordinator, status: REJECTED, owner: organiserA1, title: 'A1 rejected', createdAt: '2026-09-09T10:00:00+08:00' }),

  // Further A1 drafts. A draft may be incomplete (Clarification 2, Drafts), so these cover the states the
  // drafts list has to render: a title with a date, a title without one, and no title at all.
  eventRequest({ slug: 'a1-draft-summit', status: DRAFT, owner: organiserA1, title: 'Annual partner summit', draft: true, draftCore: { preferredDateTime: '2026-12-03T09:30:00+08:00', expectedAttendees: 240 }, createdAt: '2026-09-17T09:00:00+08:00' }),
  eventRequest({ slug: 'a1-draft-rehearsal', status: DRAFT, owner: organiserA1, title: 'Product launch rehearsal', draft: true, draftCore: { expectedAttendees: 60 }, createdAt: '2026-09-18T14:20:00+08:00' }),
  eventRequest({ slug: 'a1-draft-untitled', status: DRAFT, owner: organiserA1, title: '', draft: true, draftCore: { preferredDateTime: '2027-01-15T18:00:00+08:00' }, createdAt: '2026-09-19T08:05:00+08:00' }),

  // Organisation A, organiser A2 — the colleague.
  eventRequest({ slug: 'a2-draft', status: DRAFT, owner: organiserA2, title: 'A2 draft (private to A2, hidden from A1)', draft: true, createdAt: '2026-09-10T10:00:00+08:00' }),
  eventRequest({ slug: 'a2-submitted', coordinator: coordinator2, status: SUBMITTED, owner: organiserA2, title: 'A2 submitted (A1 can view, cannot edit)', createdAt: '2026-09-10T11:00:00+08:00' }),

  // Organisation B — invisible to organisation A. Assigned to technical staff only, so venue-only
  // staff cannot see it while the venue+technical account can.
  eventRequest({ slug: 'b1-draft', status: DRAFT, owner: organiserB1, title: 'B1 draft (private to B1)', draft: true, createdAt: '2026-09-11T10:00:00+08:00' }),
  eventRequest({ slug: 'b1-planning', coordinator: coordinator2, status: PLANNING, owner: organiserB1, title: 'B1 planning (technical staff only)', assigned: [technicalStaff, venueTechnicalStaff], createdAt: '2026-09-11T11:00:00+08:00' }),
])

// SPM-28 — field change history on A1's planning event, so the Change history panel can be checked on the
// seed: the assigned Coordinator sees all three entries, the owning Organiser (A1) the two that are not
// internal planning. Each newValue is the value seeded above, so the history ends at the current record.
// Stored as activity documents with these fixed ids; seed.js overwrites them on every run.
const PLANNING_REQUEST_ID = `${SEED_ID_PREFIX}req-a1-planning`
const planningRequest = SEED_REQUESTS.find((request) => request.id === PLANNING_REQUEST_ID)

function historyEntry(id, field, oldValue, newValue, account, role, at) {
  return { id: `${SEED_ID_PREFIX}history-${id}`, type: 'field_changed', field, oldValue, newValue, actor: { type: 'user', uid: account.uid, name: account.name, role }, at }
}

export const SEED_FIELD_HISTORY = Object.freeze({
  [PLANNING_REQUEST_ID]: Object.freeze([
    historyEntry('a1-planning-1', 'core.expectedAttendees', 60, planningRequest.core.expectedAttendees, coordinator, 'coordinator', '2026-09-12T10:00:00.000Z'),
    historyEntry('a1-planning-2', 'venue.layoutPreference', 'banquet', planningRequest.venue.layoutPreference, venueStaff, 'venue_staff', '2026-09-13T10:00:00.000Z'),
    historyEntry('a1-planning-3', 'internal.planningNotes', '', planningRequest.internal.planningNotes, coordinator, 'coordinator', '2026-09-14T10:00:00.000Z'),
  ]),
})
