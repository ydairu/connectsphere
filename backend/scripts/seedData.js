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
  venueStaff: account('venue-staff', 'Seed Venue Staff', [VENUE_STAFF]),
  technicalStaff: account('technical-staff', 'Seed Technical Staff', [TECHNICAL_STAFF]),
  // SPM-42 combined-permissions criterion: one account, two staff roles.
  venueTechnicalStaff: account('venue-technical-staff', 'Seed Venue + Technical Staff', [VENUE_STAFF, TECHNICAL_STAFF]),
  attendee: account('attendee', 'Seed Attendee', [ATTENDEE]),
  // Organisation A has two organisers: organisation scoping plus the colleague-views-but-cannot-edit rule.
  organiserA1: account('organiser-a1', 'Seed Organiser A1', [ORGANISER], SEED_ORGANISATIONS.A),
  organiserA2: account('organiser-a2', 'Seed Organiser A2', [ORGANISER], SEED_ORGANISATIONS.A),
  organiserB1: account('organiser-b1', 'Seed Organiser B1', [ORGANISER], SEED_ORGANISATIONS.B),
})

const { venueStaff, technicalStaff, venueTechnicalStaff, organiserA1, organiserA2, organiserB1 } = SEED_ACCOUNTS

function eventRequest({ slug, status, owner, title, assigned = [], registrationEnabled = false, draft = false, createdAt }) {
  const core = draft
    ? { title, purpose: null, description: null, preferredDateTime: null, durationHours: null, expectedAttendees: null }
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
  eventRequest({ slug: 'a1-draft', status: DRAFT, owner: organiserA1, title: 'A1 draft (private to A1)', draft: true, createdAt: '2026-09-01T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-submitted', status: SUBMITTED, owner: organiserA1, title: 'A1 submitted', createdAt: '2026-09-02T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-under-review', status: UNDER_REVIEW, owner: organiserA1, title: 'A1 under review', createdAt: '2026-09-03T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-returned', status: RETURNED, owner: organiserA1, title: 'A1 returned for clarification', createdAt: '2026-09-04T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-planning', status: PLANNING, owner: organiserA1, title: 'A1 planning (all staff assigned)', assigned: bothStaffTeams, createdAt: '2026-09-05T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-confirmed', status: CONFIRMED, owner: organiserA1, title: 'A1 confirmed (registration open)', assigned: bothStaffTeams, registrationEnabled: true, createdAt: '2026-09-06T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-completed', status: COMPLETED, owner: organiserA1, title: 'A1 completed', assigned: bothStaffTeams, createdAt: '2026-09-07T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-cancelled', status: CANCELLED, owner: organiserA1, title: 'A1 cancelled', assigned: bothStaffTeams, createdAt: '2026-09-08T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-rejected', status: REJECTED, owner: organiserA1, title: 'A1 rejected', createdAt: '2026-09-09T10:00:00+08:00' }),

  // Organisation A, organiser A2 — the colleague.
  eventRequest({ slug: 'a2-draft', status: DRAFT, owner: organiserA2, title: 'A2 draft (private to A2, hidden from A1)', draft: true, createdAt: '2026-09-10T10:00:00+08:00' }),
  eventRequest({ slug: 'a2-submitted', status: SUBMITTED, owner: organiserA2, title: 'A2 submitted (A1 can view, cannot edit)', createdAt: '2026-09-10T11:00:00+08:00' }),

  // Organisation B — invisible to organisation A. Assigned to technical staff only, so venue-only
  // staff cannot see it while the venue+technical account can.
  eventRequest({ slug: 'b1-draft', status: DRAFT, owner: organiserB1, title: 'B1 draft (private to B1)', draft: true, createdAt: '2026-09-11T10:00:00+08:00' }),
  eventRequest({ slug: 'b1-planning', status: PLANNING, owner: organiserB1, title: 'B1 planning (technical staff only)', assigned: [technicalStaff, venueTechnicalStaff], createdAt: '2026-09-11T11:00:00+08:00' }),
])
