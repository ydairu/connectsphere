// SPM-42 API cases, asserted on real HTTP status codes and response bodies. Registered by two suites:
//   requestApi.test.js       in-memory persistence and stubbed token verification (runs in CI)
//   requestApi.live.test.js  real Firebase Auth tokens and the real Firestore project (opt-in)
// Both serve the same Express app, middleware and shared/permissions.js; only persistence and token
// verification differ. Accounts and requests are the seed data (backend/scripts/seedData.js).
//
// Cases that succeed in changing a record restore the seeded value before they finish, so the live
// project stays in its seeded state. If a live run is interrupted, re-run the seed script to reset.

import { describe, expect, it } from 'vitest'

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { CONFIRMED, DRAFT } from '../../../shared/status.js'
import { apiClient } from '../../shared/helpers/requestApiServer.js'

const seeded = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))

const A1_DRAFT = 'seed-req-a1-draft'
const A1_SUBMITTED = 'seed-req-a1-submitted'
const A1_RETURNED = 'seed-req-a1-returned'
const A1_PLANNING = 'seed-req-a1-planning'
const A1_CONFIRMED = 'seed-req-a1-confirmed'
const A2_DRAFT = 'seed-req-a2-draft'
const A2_SUBMITTED = 'seed-req-a2-submitted'

/** @param {{ baseUrl: () => string, tokenFor: (accountKey: string) => Promise<string> }} harness */
export function registerSpm42ApiCases(harness) {
  const { get, list, patch } = apiClient(harness)

describe("SPM-42 — View and Edit Information According to My Role's Permissions (API)", () => {
  describe('View', () => {
    it('Attendee requests a draft by direct ID', async () => {
      const response = await get('attendee', A1_DRAFT)
      expect(response.status).toBe(403)
      expect(response.json.request).toBe(undefined)
      expect(!response.text.includes(seeded[A1_DRAFT].core.title), 'no draft content in the body').toBeTruthy()
    })

    it("Organiser opens a colleague's draft in the same organisation", async () => {
      const response = await get('organiserA1', A2_DRAFT)
      expect(response.status).toBe(403)
    })

    it("Organiser views a colleague's submitted request in the same organisation", async () => {
      const response = await get('organiserA1', A2_SUBMITTED)
      expect(response.status).toBe(200)
      expect(response.json.request.id).toBe(A2_SUBMITTED)
      expect(response.json.editableSections).toEqual([])
    })

    it("Organiser requests another organisation's event by direct ID", async () => {
      const response = await get('organiserB1', A1_SUBMITTED)
      expect(response.status).toBe(403)
    })

    it('Coordinator lists all requests — drafts absent', async () => {
      const response = await list('coordinator')
      expect(response.status).toBe(200)
      const ids = response.json.requests.map((request) => request.id)
      expect(response.json.requests.filter((request) => request.status === DRAFT)).toEqual([])
      for (const request of SEED_REQUESTS.filter((candidate) => candidate.status !== DRAFT)) {
        expect(ids.includes(request.id), `${request.id} (${request.status}) should be listed`).toBeTruthy()
      }
    })

    it('Organiser lists requests — own drafts and own organisation only', async () => {
      const response = await list('organiserA1')
      expect(response.status).toBe(200)
      const ids = response.json.requests.map((request) => request.id)
      expect(ids.includes(A1_DRAFT), 'own draft listed').toBeTruthy()
      expect(ids.includes(A2_SUBMITTED), "colleague's submitted request listed").toBeTruthy()
      expect(!ids.includes(A2_DRAFT), "colleague's draft not listed").toBeTruthy()
      expect(!ids.some((id) => id.startsWith('seed-req-b1-')), 'no organisation B request listed').toBeTruthy()
    })

    it('Venue staff GETs an assigned event — equipment section absent', async () => {
      const response = await get('venueStaff', A1_PLANNING)
      expect(response.status).toBe(200)
      expect(Object.keys(response.json.request).sort()).toEqual(['core', 'id', 'status', 'venue'])
      expect(!response.text.includes('projector'), 'equipment values absent from the raw body').toBeTruthy()
      expect(response.json.editableSections).toEqual(['venue'])
    })

    it('Technical staff GETs an assigned event — venue section absent', async () => {
      const response = await get('technicalStaff', A1_PLANNING)
      expect(response.status).toBe(200)
      expect(Object.keys(response.json.request).sort()).toEqual(['core', 'equipment', 'id', 'status'])
      expect(!response.text.includes('layoutPreference'), 'venue fields absent from the raw body').toBeTruthy()
    })

    it('Attendee GETs a confirmed event — no internal fields in the body', async () => {
      const response = await get('attendee', A1_CONFIRMED)
      expect(response.status).toBe(200)
      expect(response.json.request.status).toBe(CONFIRMED)
      expect(Object.keys(response.json.request).sort()).toEqual(['core', 'id', 'status'])
      expect(!response.text.includes('Seed internal note'), 'internal planning notes absent from the raw body').toBeTruthy()
      expect(!response.text.includes('seed-organiser-a1'), 'owner uid absent from the raw body').toBeTruthy()
    })

    it('Request without a token is refused', async () => {
      const response = await get(undefined, A1_SUBMITTED)
      expect(response.status).toBe(401)
    })

    it('Unknown request id', async () => {
      const response = await get('coordinator', 'seed-req-does-not-exist')
      expect(response.status).toBe(404)
    })
  })

  describe('Edit', () => {
    it('Organiser PATCHes their own request while it is submitted', async () => {
      const response = await patch('organiserA1', A1_SUBMITTED, { core: { title: 'Changed after submission' } })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['core.title'])

      const after = await get('organiserA1', A1_SUBMITTED)
      expect(after.json.request.core.title, 'record unchanged').toBe(seeded[A1_SUBMITTED].core.title)
    })

    it("Organiser PATCHes a colleague's submitted request", async () => {
      const response = await patch('organiserA1', A2_SUBMITTED, { core: { title: 'Edited by colleague' } })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['core.title'])
    })

    it('Venue staff PATCHes an equipment field', async () => {
      const response = await patch('venueStaff', A1_PLANNING, { equipment: { requirements: ['smoke machine'] } })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['equipment.requirements'])
      expect(response.json.message).toMatch(/equipment\.requirements/)

      const after = await get('technicalStaff', A1_PLANNING)
      expect(after.json.request.equipment, 'record unchanged').toEqual(seeded[A1_PLANNING].equipment)
    })

    it('Venue staff PATCHes a venue field and an equipment field together — nothing is applied', async () => {
      const response = await patch('venueStaff', A1_PLANNING, {
        venue: { layoutPreference: 'banquet' },
        equipment: { requirements: ['smoke machine'] },
      })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['equipment.requirements'])

      const after = await get('venueStaff', A1_PLANNING)
      expect(after.json.request.venue.layoutPreference).toBe(seeded[A1_PLANNING].venue.layoutPreference)
    })

    it('Coordinator PATCHes the status field — status transitions are not section edits', async () => {
      const response = await patch('coordinator', A1_SUBMITTED, { status: CONFIRMED })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['status'])
    })

    it('Venue+technical dual-role account PATCHes a venue field and an equipment field', async () => {
      const original = seeded[A1_PLANNING]
      const response = await patch('venueTechnicalStaff', A1_PLANNING, {
        venue: { layoutPreference: 'banquet' },
        equipment: { requirements: ['projector', 'lectern'] },
      })
      expect(response.status).toBe(200)
      expect(response.json.request.venue.layoutPreference).toBe('banquet')
      expect(response.json.request.equipment.requirements).toEqual(['projector', 'lectern'])
      expect(response.json.editableSections).toEqual(['venue', 'equipment'])

      const persisted = await get('coordinator', A1_PLANNING)
      expect(persisted.json.request.venue.layoutPreference, 'venue change persisted').toBe('banquet')
      expect(persisted.json.request.equipment.requirements, 'equipment change persisted').toEqual(['projector', 'lectern'])

      const restored = await patch('venueTechnicalStaff', A1_PLANNING, {
        venue: { layoutPreference: original.venue.layoutPreference },
        equipment: { requirements: original.equipment.requirements },
      })
      expect(restored.status, 'seeded values restored').toBe(200)
    })

    it('Organiser edits their own request after it is returned for clarification', async () => {
      const response = await patch('organiserA1', A1_RETURNED, { core: { purpose: 'Clarified purpose' } })
      expect(response.status).toBe(200)
      expect(response.json.request.core.purpose).toBe('Clarified purpose')

      const restored = await patch('organiserA1', A1_RETURNED, { core: { purpose: seeded[A1_RETURNED].core.purpose } })
      expect(restored.status, 'seeded value restored').toBe(200)
    })

    it('Coordinator edits any section on an unassigned event', async () => {
      expect(seeded[A1_SUBMITTED].assignedStaffUids, 'precondition: no staff assigned').toEqual([])
      const response = await patch('coordinator', A1_SUBMITTED, {
        internal: { planningNotes: 'Coordinator note' },
        equipment: { technicalSupportNeeded: false },
      })
      expect(response.status).toBe(200)
      expect(response.json.request.internal.planningNotes).toBe('Coordinator note')

      const restored = await patch('coordinator', A1_SUBMITTED, {
        internal: { planningNotes: seeded[A1_SUBMITTED].internal.planningNotes },
        equipment: { technicalSupportNeeded: seeded[A1_SUBMITTED].equipment.technicalSupportNeeded },
      })
      expect(restored.status, 'seeded values restored').toBe(200)
    })

    it('Attendee PATCHes a draft they cannot see — refused without naming fields', async () => {
      const response = await patch('attendee', A1_DRAFT, { core: { title: 'x' } })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toBe(undefined)
    })

    it('PATCH with a section that is not an object of fields', async () => {
      const response = await patch('venueStaff', A1_PLANNING, { venue: 'banquet' })
      expect(response.status).toBe(400)
    })
  })
})
}
