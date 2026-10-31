// Proves, offline, that the seed can demonstrate what it exists to demonstrate. Each check runs the seed
// through shared/permissions.js rather than just counting rows.

import { describe, expect, it } from 'vitest'

import {
  CORE,
  EQUIPMENT_PREPARATION,
  ORGANISER,
  ROLES,
  TECHNICAL_STAFF,
  VENUE_PREPARATION,
  VENUE_STAFF,
  canEdit,
  inScope,
  projectRequest,
} from '../../../shared/permissions.js'
import { DRAFT, STATUSES } from '../../../shared/status.js'
import { SEED_ACCOUNTS, SEED_ID_PREFIX, SEED_REQUESTS, SEED_TAG } from '../../../backend/scripts/seedData.js'

const accounts = Object.values(SEED_ACCOUNTS)
const byId = Object.fromEntries(SEED_REQUESTS.map((r) => [r.id, r]))
const { coordinator, venueStaff, venueTechnicalStaff, attendee, organiserA1, organiserA2, organiserB1 } = SEED_ACCOUNTS

describe('Seed data — SPM-42 / SPM-24 demonstration coverage', () => {
  it('Seed holds an account for each of the five roles', () => {
    for (const role of ROLES) {
      expect(accounts.some((a) => a.roles.length === 1 && a.roles[0] === role), `no single-role ${role} account`).toBeTruthy()
    }
  })

  it('Seed holds one account with both venue_staff and technical_staff', () => {
    const dual = accounts.filter((a) => a.roles.includes(VENUE_STAFF) && a.roles.includes(TECHNICAL_STAFF))
    expect(dual.length).toBe(1)
  })

  it('Seed holds at least two organisations, one of them with two organisers', () => {
    const organisersByOrg = {}
    for (const a of accounts.filter((a) => a.roles.includes(ORGANISER))) {
      expect(a.organisationId, `${a.uid} has no organisationId`).toBeTruthy()
      organisersByOrg[a.organisationId] = (organisersByOrg[a.organisationId] ?? 0) + 1
    }
    expect(Object.keys(organisersByOrg).length >= 2).toBeTruthy()
    expect(Object.values(organisersByOrg).some((n) => n >= 2)).toBeTruthy()
  })

  it('Seed holds an event request in every status in shared/status.js', () => {
    const seeded = new Set(SEED_REQUESTS.map((r) => r.status))
    for (const status of STATUSES) expect(seeded.has(status), `no seeded request at ${status}`).toBeTruthy()
  })

  it('Seed drafts are owned by different organisers', () => {
    const owners = new Set(SEED_REQUESTS.filter((r) => r.status === DRAFT).map((r) => r.ownerUid))
    expect(owners.size >= 2).toBeTruthy()
  })

  it('Every seeded account and request has a unique ID carrying the seed prefix', () => {
    expect(SEED_TAG).toBeTruthy()
    for (const { uid } of accounts) expect(uid.startsWith(SEED_ID_PREFIX), uid).toBeTruthy()
    for (const { id } of SEED_REQUESTS) expect(id.startsWith(SEED_ID_PREFIX), id).toBeTruthy()
    expect(new Set(SEED_REQUESTS.map((r) => r.id)).size, 'duplicate request id').toBe(SEED_REQUESTS.length)
    expect(new Set(accounts.map((a) => a.email)).size, 'duplicate email').toBe(accounts.length)
  })

  it('Demonstrable on the seed: same-organisation colleague views but cannot edit a submitted request', () => {
    const request = byId['seed-req-a2-submitted']
    expect(inScope(organiserA1, request)).toBe(true)
    expect(canEdit(organiserA1, request, CORE)).toBe(false)
  })

  it("Demonstrable on the seed: a colleague's draft and another organisation's events are out of scope", () => {
    expect(inScope(organiserA1, byId['seed-req-a2-draft'])).toBe(false)
    expect(inScope(organiserB1, byId['seed-req-a1-submitted'])).toBe(false)
    expect(inScope(organiserA2, byId['seed-req-b1-planning'])).toBe(false)
  })

  it('Demonstrable on the seed: coordinator sees the non-draft requests assigned to them and no draft', () => {
    for (const request of SEED_REQUESTS) {
      const expected = request.status !== DRAFT && request.assignedCoordinatorUid === coordinator.uid
      expect(inScope(coordinator, request), request.id).toBe(expected)
    }
    expect(inScope(coordinator, byId['seed-req-a2-submitted']), "coordinator-2's event").toBe(false)
  })

  it('Demonstrable on the seed: owner edits a returned request but not a submitted one', () => {
    expect(canEdit(organiserA1, byId['seed-req-a1-returned'], CORE)).toBe(true)
    expect(canEdit(organiserA1, byId['seed-req-a1-submitted'], CORE)).toBe(false)
  })

  it('Demonstrable on the seed: the dual-role account edits equipment preparation; venue preparation uses bookings', () => {
    // SPM-88: the staff sections open at Preparation, not on approval alone.
    const preparation = byId['seed-req-a1-confirmed-past']
    expect(canEdit(venueTechnicalStaff, preparation, VENUE_PREPARATION)).toBe(false)
    expect(canEdit(venueTechnicalStaff, preparation, EQUIPMENT_PREPARATION)).toBe(true)
    expect(canEdit(venueTechnicalStaff, byId['seed-req-a1-confirmed'], VENUE_PREPARATION)).toBe(false)
    const planning = byId['seed-req-b1-planning']
    expect(inScope(venueTechnicalStaff, planning)).toBe(true)
    expect(inScope(venueStaff, planning)).toBe(false)
  })

  it('Demonstrable on the seed: attendee receives a confirmed event without internal fields', () => {
    const body = projectRequest(attendee, byId['seed-req-a1-confirmed'])
    expect(body).toBeTruthy()
    expect(Object.hasOwn(body, 'internal')).toBe(false)
  })
})
