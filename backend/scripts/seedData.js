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
import { ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT, VENUE_ARRANGEMENT } from '../../shared/arrangementDecisions.js'
import { buildVenueRecord } from '../../shared/venue.js'
import { EQUIPMENT_UNIT_STATUS, normaliseEquipmentTypeInput, normaliseEquipmentUnitInput } from '../../shared/equipment.js'
import { EQUIPMENT_REQUEST_STATUS, normaliseEquipmentRequest } from '../../shared/equipmentRequest.js'
import { AVAILABILITY_STATUS } from '../../shared/venueAvailability.js'

export const SEED_TAG = 'spm42-spm24-sprint1'
export const SEED_ID_PREFIX = 'seed-'
export const EVENT_REQUESTS_COLLECTION = 'eventRequests'
export const VENUES_COLLECTION = 'venues'
export const VENUE_AVAILABILITY_COLLECTION = 'venueAvailability'
export const EQUIPMENT_TYPES_COLLECTION = 'equipmentTypes'
export const EQUIPMENT_UNITS_COLLECTION = 'equipmentUnits'
export const EQUIPMENT_REQUESTS_COLLECTION = 'equipmentRequests'

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
  // next submission visibly goes to the one with the fewest. Seeded workloads: 5, 2 and 1 (see SEED_REQUESTS).
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
// `approvals` is SPM-9's arrangementApprovals record metadata, set only where a request needs it.
// SPM-56: the equipment requests each seeded event's summary (currentEquipmentRequest) names; the requests
// themselves are SEED_EQUIPMENT_REQUESTS below. A1's Planning event is deliberately left without a summary:
// SPM-9 and SPM-10 demonstrate the manual technical sign-off on it, which a summary would refuse. Its
// Pending Review request is therefore in the state of a request made before SPM-56; approving it writes the
// summary. B1's Planning event carries one, so the seed shows both.
const A1_PENDING_EQUIPMENT_REQUEST_ID = `${SEED_ID_PREFIX}equipment-request-a1-planning-2`
const B1_SHORT_EQUIPMENT_REQUEST_ID = `${SEED_ID_PREFIX}equipment-request-b1-planning-1`

function eventRequest({ slug, status, owner, title, coordinator, assigned = [], registrationEnabled = false, draft = false, draftCore = {}, approvals, preferredDateTime = '2026-11-20T09:00:00+08:00', currentEquipmentRequest, createdAt }) {
  const core = draft
    ? { title, purpose: null, description: null, preferredDateTime: null, durationHours: null, expectedAttendees: null, ...draftCore }
    : {
        title,
        purpose: `Seeded ${status} request for permission demonstrations`,
        description: 'Seed data — safe to delete by seedTag.',
        preferredDateTime,
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
    ...(approvals ? { arrangementApprovals: approvals } : {}),
    ...(currentEquipmentRequest ? { currentEquipmentRequest } : {}),
    createdAt,
  }
}

const bothStaffTeams = [venueStaff, technicalStaff, venueTechnicalStaff]

// SPM-48: a Confirmed event has had its venue and technical sign-off approved (SPM-9's Confirm requires
// both), so assigned staff may update its preparation. A1's planning event has no sign-off yet, so there
// preparation is read-only.
const bothArrangementsApproved = {
  [VENUE_ARRANGEMENT]: { decision: ARRANGEMENT_APPROVED, byUid: venueStaff.uid, at: '2026-09-06T12:00:00+08:00' },
  [TECHNICAL_ARRANGEMENT]: { decision: ARRANGEMENT_APPROVED, byUid: technicalStaff.uid, at: '2026-09-06T12:30:00+08:00' },
}

export const SEED_REQUESTS = Object.freeze([
  // Organisation A, organiser A1 — one request in every status.
  // SPM-8 workloads (active = Submitted, Under Review, Returned, Planning, Confirmed): coordinator 5,
  // coordinator-2 2, coordinator-3 1. Finished requests are assigned too, but do not count.
  eventRequest({ slug: 'a1-draft', status: DRAFT, owner: organiserA1, title: 'A1 draft (private to A1)', draft: true, createdAt: '2026-09-01T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-submitted', coordinator, status: SUBMITTED, owner: organiserA1, title: 'A1 submitted', createdAt: '2026-09-02T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-under-review', coordinator, status: UNDER_REVIEW, owner: organiserA1, title: 'A1 under review', createdAt: '2026-09-03T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-returned', coordinator, status: RETURNED, owner: organiserA1, title: 'A1 returned for clarification', createdAt: '2026-09-04T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-planning', coordinator, status: PLANNING, owner: organiserA1, title: 'A1 planning (all staff assigned)', assigned: bothStaffTeams, createdAt: '2026-09-05T10:00:00+08:00' }),
  eventRequest({ slug: 'a1-confirmed', coordinator: coordinator3, status: CONFIRMED, owner: organiserA1, title: 'A1 confirmed (registration open)', assigned: bothStaffTeams, registrationEnabled: true, approvals: bothArrangementsApproved, createdAt: '2026-09-06T10:00:00+08:00' }),
  // SPM-27 demo: a Confirmed event that has already taken place (1 Oct 2026), so its Coordinator can mark it
  // completed. No venue booking or hold, so it clashes with nothing seeded. Counts towards Seed Coordinator's
  // workload (5), which keeps coordinator-3 the next to be assigned.
  eventRequest({ slug: 'a1-confirmed-past', coordinator, status: CONFIRMED, owner: organiserA1, title: 'A1 confirmed (event held, ready to complete)', assigned: bothStaffTeams, approvals: bothArrangementsApproved, preferredDateTime: '2026-10-01T09:00:00+08:00', createdAt: '2026-09-06T11:00:00+08:00' }),
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
  // staff cannot see it while the venue+technical account can. SPM-16: a week after the other events, so
  // its tentative hold on the seeded hall (SEED_VENUE_AVAILABILITY) does not clash with A1's booking.
  eventRequest({ slug: 'b1-draft', status: DRAFT, owner: organiserB1, title: 'B1 draft (private to B1)', draft: true, createdAt: '2026-09-11T10:00:00+08:00' }),
  eventRequest({ slug: 'b1-planning', coordinator: coordinator2, status: PLANNING, owner: organiserB1, title: 'B1 planning (technical staff only)', assigned: [technicalStaff, venueTechnicalStaff], preferredDateTime: '2026-11-27T09:00:00+08:00', currentEquipmentRequest: { id: B1_SHORT_EQUIPMENT_REQUEST_ID, status: 'pending_review' }, createdAt: '2026-09-11T11:00:00+08:00' }),
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
    // Historical: predates SPM-48, when Venue Staff could still edit the venue section. Kept as recorded.
    historyEntry('a1-planning-2', 'venue.layoutPreference', 'banquet', planningRequest.venue.layoutPreference, venueStaff, 'venue_staff', '2026-09-13T10:00:00.000Z'),
    historyEntry('a1-planning-3', 'internal.planningNotes', '', planningRequest.internal.planningNotes, coordinator, 'coordinator', '2026-09-14T10:00:00.000Z'),
  ]),
})

// SPM-16 / SPM-72 — venues and venueAvailability entries for demonstrating conflict detection. The hall
// has setup and turnaround times and holds one of each kind of entry; the room has neither and nothing
// booked, for the back-to-back and multi-venue cases. Built with buildVenueRecord so they pass the same
// validation as a venue created in the app. The hall's booking has not ended, so its setup and turnaround
// are locked (SPM-72 AC5).
const VENUE_CREATED_AT = new Date('2026-09-20T09:00:00+08:00')

function seedVenue(slug, input) {
  const { venue, errors } = buildVenueRecord(input, venueStaff, VENUE_CREATED_AT)
  if (Object.keys(errors).length > 0) throw new Error(`Seed venue ${slug} is invalid: ${JSON.stringify(errors)}`)
  return { id: `${SEED_ID_PREFIX}venue-${slug}`, ...venue }
}

export const SEED_VENUES = Object.freeze([
  seedVenue('hall', {
    name: 'Seed Hall (setup 30, turnaround 45)',
    location: 'Level 1, Main Campus',
    maximumCapacity: 200,
    facilities: ['Projector', 'Wireless microphone'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Theatre', 'Banquet'],
    operatingHours: 'Daily 08:00-22:00',
    setupMinutes: 30,
    turnaroundMinutes: 45,
  }),
  seedVenue('room', {
    name: 'Seed Breakout Room (no setup or turnaround)',
    location: 'Level 2, Main Campus',
    maximumCapacity: 40,
    facilities: ['Whiteboard'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Classroom'],
    operatingHours: 'Daily 08:00-22:00',
    setupMinutes: 0,
    turnaroundMinutes: 0,
  }),
])

const HOUR_MS = 60 * 60 * 1000
const hall = SEED_VENUES[0]

// A seeded event's own period, from its preferredDateTime and durationHours.
export function seedEventPeriod(slug) {
  const { core } = SEED_REQUESTS.find((request) => request.id === `${SEED_ID_PREFIX}req-${slug}`)
  const startsAt = new Date(core.preferredDateTime)
  return { startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + core.durationHours * HOUR_MS).toISOString() }
}

function availability(slug, fields) {
  return { id: `${SEED_ID_PREFIX}availability-${slug}`, venueId: hall.id, lifecycleStatus: 'active', ...fields }
}

export const SEED_VENUE_AVAILABILITY = Object.freeze([
  // A1's Confirmed event, at its own date and time (09:00-13:00 SGT, 20 Nov): occupies 08:30-13:45.
  availability('a1-confirmed-booking', {
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    eventRequestId: `${SEED_ID_PREFIX}req-a1-confirmed`,
    ...seedEventPeriod('a1-confirmed'),
    title: 'A1 confirmed (registration open)',
    createdByUid: coordinator3.uid,
    createdByName: coordinator3.name,
    createdAt: '2026-09-06T12:00:00.000Z',
  }),
  // B1's Planning event, at its own date and time (09:00-13:00 SGT, 27 Nov). The expiry is set far ahead
  // so the hold stays active for demonstrations.
  availability('b1-planning-hold', {
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
    eventRequestId: `${SEED_ID_PREFIX}req-b1-planning`,
    ...seedEventPeriod('b1-planning'),
    title: 'B1 planning (tentative hold)',
    holdExpiresAt: '2027-06-30T15:59:59.000Z',
    createdByUid: coordinator2.uid,
    createdByName: coordinator2.name,
    createdAt: '2026-09-12T02:00:00.000Z',
  }),
  // Expired, and linked to no event: 14:00-17:00 SGT on 4 Dec would be blocked if it were still active.
  availability('expired-hold', {
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
    eventRequestId: null,
    startsAt: '2026-12-04T06:00:00.000Z',
    endsAt: '2026-12-04T09:00:00.000Z',
    title: 'Expired hold (no event)',
    holdExpiresAt: '2026-10-01T10:00:00.000Z',
    createdByUid: coordinator.uid,
    createdByName: coordinator.name,
    createdAt: '2026-09-24T02:00:00.000Z',
  }),
])

// SPM-37 / SPM-17 — equipment types with a few Available units each, so availability is not empty in demos,
// and A1's Planning event with an equipment request that was rejected and the Pending Review request that
// replaced it. Built with SPM-37's and SPM-17's normalisers so they pass the same validation as the app.
// The rejected request records only its status: what a rejection records (who, why) belongs to SPM-56/36.
const EQUIPMENT_CREATED_AT = '2026-09-20T01:00:00.000Z'

function seedEquipmentType(slug, input) {
  const { equipmentType, errors } = normaliseEquipmentTypeInput(input)
  if (Object.keys(errors).length > 0) throw new Error(`Seed equipment type ${slug} is invalid: ${JSON.stringify(errors)}`)
  return { id: `${SEED_ID_PREFIX}equipment-${slug}`, ...equipmentType, createdByUid: technicalStaff.uid, createdByName: technicalStaff.name, createdAt: EQUIPMENT_CREATED_AT }
}

export const SEED_EQUIPMENT_TYPES = Object.freeze([
  seedEquipmentType('projector', { name: 'Projector', location: 'AV store, Level 1' }),
  seedEquipmentType('wireless-mic', { name: 'Wireless microphone', location: 'AV store, Level 1' }),
  seedEquipmentType('pa-speaker', { name: 'PA speaker set', location: 'AV store, Level 2' }),
])

function seedEquipmentUnit(type, number) {
  const assetTag = `${type.name.split(' ').map((word) => word[0]).join('').toUpperCase()}-${String(number).padStart(3, '0')}`
  const { unit, errors } = normaliseEquipmentUnitInput({ assetTag })
  if (Object.keys(errors).length > 0) throw new Error(`Seed equipment unit ${assetTag} is invalid: ${JSON.stringify(errors)}`)
  return {
    id: `${type.id}-unit-${number}`,
    equipmentTypeId: type.id,
    assetTag: unit.assetTag,
    status: EQUIPMENT_UNIT_STATUS.AVAILABLE,
    statusNote: null,
    createdByUid: technicalStaff.uid,
    createdByName: technicalStaff.name,
    createdAt: EQUIPMENT_CREATED_AT,
    updatedByUid: technicalStaff.uid,
    updatedByName: technicalStaff.name,
    updatedAt: EQUIPMENT_CREATED_AT,
  }
}

const UNITS_PER_TYPE = { projector: 3, 'wireless-mic': 3, 'pa-speaker': 2 }
export const SEED_EQUIPMENT_UNITS = Object.freeze(
  SEED_EQUIPMENT_TYPES.flatMap((type) => {
    const count = UNITS_PER_TYPE[type.id.slice(`${SEED_ID_PREFIX}equipment-`.length)]
    return Array.from({ length: count }, (_, index) => seedEquipmentUnit(type, index + 1))
  }),
)

const [projectorType, micType, speakerType] = SEED_EQUIPMENT_TYPES
const REJECTED_EQUIPMENT_REQUEST_ID = `${SEED_ID_PREFIX}equipment-request-a1-planning-1`
const PENDING_EQUIPMENT_REQUEST_ID = A1_PENDING_EQUIPMENT_REQUEST_ID

function seedEquipmentRequest(id, { items, submissionKey, createdAt, event = planningRequest, ...fields }) {
  const { value, errors } = normaliseEquipmentRequest({ items: items.map(({ type, ...item }) => ({ ...item, equipmentTypeId: type.id })), submissionKey })
  if (Object.keys(errors).length > 0) throw new Error(`Seed equipment request ${id} is invalid: ${JSON.stringify(errors)}`)
  const names = new Map(SEED_EQUIPMENT_TYPES.map((type) => [type.id, type.name]))
  return {
    id,
    eventRequestId: event.id,
    eventTitle: event.core.title,
    items: value.items.map((item) => ({ ...item, equipmentTypeName: names.get(item.equipmentTypeId) })),
    requiredPeriod: seedEventPeriod(event.id.slice(`${SEED_ID_PREFIX}req-`.length)),
    assignedTechnicalStaffUid: technicalStaff.uid,
    assignedTechnicalStaffName: technicalStaff.name,
    submissionKey: value.submissionKey,
    createdByUid: coordinator.uid,
    createdAt,
    ...fields,
  }
}

export const SEED_EQUIPMENT_REQUESTS = Object.freeze([
  seedEquipmentRequest(REJECTED_EQUIPMENT_REQUEST_ID, {
    items: [{ type: projectorType, quantity: 4, technicalRequirements: 'Four screens round the room' }],
    submissionKey: 'seed-a1-planning-equipment-1',
    status: EQUIPMENT_REQUEST_STATUS.REJECTED,
    replacesId: null,
    replacedById: PENDING_EQUIPMENT_REQUEST_ID,
    createdAt: '2026-09-15T02:00:00.000Z',
  }),
  seedEquipmentRequest(PENDING_EQUIPMENT_REQUEST_ID, {
    items: [
      { type: projectorType, quantity: 2, technicalRequirements: 'HDMI at the lectern' },
      { type: micType, quantity: 2 },
      { type: speakerType, quantity: 1 },
    ],
    submissionKey: 'seed-a1-planning-equipment-2',
    status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW,
    replacesId: REJECTED_EQUIPMENT_REQUEST_ID,
    createdAt: '2026-09-16T02:00:00.000Z',
  }),
  // SPM-56: B1's Planning event asks for more PA speaker sets than exist (3 against 2 Available units), so
  // approval is refused with a shortfall. A1's request above can be fulfilled (2, 2 and 1 against 3, 3 and 2).
  seedEquipmentRequest(B1_SHORT_EQUIPMENT_REQUEST_ID, {
    event: SEED_REQUESTS.find((request) => request.id === `${SEED_ID_PREFIX}req-b1-planning`),
    items: [
      { type: speakerType, quantity: 3, technicalRequirements: 'Outdoor coverage for 120 people' },
      { type: projectorType, quantity: 1 },
    ],
    submissionKey: 'seed-b1-planning-equipment-1',
    status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW,
    replacesId: null,
    createdAt: '2026-09-17T02:00:00.000Z',
  }),
])
