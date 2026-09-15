// SPM-42 API cases, asserted on real HTTP status codes and response bodies. Shared by two harnesses:
//   requestRoutes.test.js  in-memory users and requests, stubbed token verification (runs in `npm test`)
//   requestRoutes.live.js  real Firebase Auth tokens and the real Firestore project (opt-in)
// Both serve the same Express app, middleware and shared/permissions.js; only the persistence and token
// verification differ. Accounts and requests are the seed data (backend/scripts/seedData.js).
//
// Tests that succeed in changing a record put the seeded value back before they finish, so the live
// project stays in its seeded state. If a live run is interrupted, re-run the seed script to reset.
//
// Test names follow the plan's test-name mapping (.claude/sprint1-permissions-plan.md).

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { SEED_REQUESTS } from '../../scripts/seedData.js'
import { CONFIRMED, DRAFT } from '../../../shared/status.js'

const seeded = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))

const A1_DRAFT = 'seed-req-a1-draft'
const A1_SUBMITTED = 'seed-req-a1-submitted'
const A1_RETURNED = 'seed-req-a1-returned'
const A1_PLANNING = 'seed-req-a1-planning'
const A1_CONFIRMED = 'seed-req-a1-confirmed'
const A2_DRAFT = 'seed-req-a2-draft'
const A2_SUBMITTED = 'seed-req-a2-submitted'

/**
 * @param {{ baseUrl: () => string, tokenFor: (accountKey: string) => Promise<string> }} harness
 *   accountKey is a key of SEED_ACCOUNTS.
 */
export function registerRequestApiCases(harness) {
  async function call(method, path, accountKey, body) {
    const headers = {}
    if (accountKey) headers.Authorization = `Bearer ${await harness.tokenFor(accountKey)}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${harness.baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, text, json: text ? JSON.parse(text) : null }
  }

  const get = (accountKey, id) => call('GET', `/api/requests/${id}`, accountKey)
  const list = (accountKey) => call('GET', '/api/requests', accountKey)
  const patch = (accountKey, id, body) => call('PATCH', `/api/requests/${id}`, accountKey, body)

  describe("SPM-42 — View and Edit Information According to My Role's Permissions (API)", () => {
    describe('View', () => {
      test('Attendee requests a draft by direct ID', async () => {
        const response = await get('attendee', A1_DRAFT)
        assert.equal(response.status, 403)
        assert.equal(response.json.request, undefined)
        assert.ok(!response.text.includes(seeded[A1_DRAFT].core.title), 'no draft content in the body')
      })

      test("Organiser opens a colleague's draft in the same organisation", async () => {
        const response = await get('organiserA1', A2_DRAFT)
        assert.equal(response.status, 403)
      })

      test("Organiser views a colleague's submitted request in the same organisation", async () => {
        const response = await get('organiserA1', A2_SUBMITTED)
        assert.equal(response.status, 200)
        assert.equal(response.json.request.id, A2_SUBMITTED)
        assert.deepEqual(response.json.editableSections, [])
      })

      test("Organiser requests another organisation's event by direct ID", async () => {
        const response = await get('organiserB1', A1_SUBMITTED)
        assert.equal(response.status, 403)
      })

      test('Coordinator lists all requests — drafts absent', async () => {
        const response = await list('coordinator')
        assert.equal(response.status, 200)
        const ids = response.json.requests.map((request) => request.id)
        assert.deepEqual(response.json.requests.filter((request) => request.status === DRAFT), [])
        for (const request of SEED_REQUESTS.filter((candidate) => candidate.status !== DRAFT)) {
          assert.ok(ids.includes(request.id), `${request.id} (${request.status}) should be listed`)
        }
      })

      test('Organiser lists requests — own drafts and own organisation only', async () => {
        const response = await list('organiserA1')
        assert.equal(response.status, 200)
        const ids = response.json.requests.map((request) => request.id)
        assert.ok(ids.includes(A1_DRAFT), 'own draft listed')
        assert.ok(ids.includes(A2_SUBMITTED), "colleague's submitted request listed")
        assert.ok(!ids.includes(A2_DRAFT), "colleague's draft not listed")
        assert.ok(!ids.some((id) => id.startsWith('seed-req-b1-')), 'no organisation B request listed')
      })

      test('Venue staff GETs an assigned event — equipment section absent', async () => {
        const response = await get('venueStaff', A1_PLANNING)
        assert.equal(response.status, 200)
        assert.deepEqual(Object.keys(response.json.request).sort(), ['core', 'id', 'status', 'venue'])
        assert.ok(!response.text.includes('projector'), 'equipment values absent from the raw body')
        assert.deepEqual(response.json.editableSections, ['venue'])
      })

      test('Technical staff GETs an assigned event — venue section absent', async () => {
        const response = await get('technicalStaff', A1_PLANNING)
        assert.equal(response.status, 200)
        assert.deepEqual(Object.keys(response.json.request).sort(), ['core', 'equipment', 'id', 'status'])
        assert.ok(!response.text.includes('layoutPreference'), 'venue fields absent from the raw body')
      })

      test('Attendee GETs a confirmed event — no internal fields in the body', async () => {
        const response = await get('attendee', A1_CONFIRMED)
        assert.equal(response.status, 200)
        assert.equal(response.json.request.status, CONFIRMED)
        assert.deepEqual(Object.keys(response.json.request).sort(), ['core', 'id', 'status'])
        assert.ok(!response.text.includes('Seed internal note'), 'internal planning notes absent from the raw body')
        assert.ok(!response.text.includes('seed-organiser-a1'), 'owner uid absent from the raw body')
      })

      test('Request without a token is refused', async () => {
        const response = await get(undefined, A1_SUBMITTED)
        assert.equal(response.status, 401)
      })

      test('Unknown request id', async () => {
        const response = await get('coordinator', 'seed-req-does-not-exist')
        assert.equal(response.status, 404)
      })
    })

    describe('Edit', () => {
      test('Organiser PATCHes their own request while it is submitted', async () => {
        const response = await patch('organiserA1', A1_SUBMITTED, { core: { title: 'Changed after submission' } })
        assert.equal(response.status, 403)
        assert.deepEqual(response.json.forbiddenFields, ['core.title'])

        const after = await get('organiserA1', A1_SUBMITTED)
        assert.equal(after.json.request.core.title, seeded[A1_SUBMITTED].core.title, 'record unchanged')
      })

      test("Organiser PATCHes a colleague's submitted request", async () => {
        const response = await patch('organiserA1', A2_SUBMITTED, { core: { title: 'Edited by colleague' } })
        assert.equal(response.status, 403)
        assert.deepEqual(response.json.forbiddenFields, ['core.title'])
      })

      test('Venue staff PATCHes an equipment field', async () => {
        const response = await patch('venueStaff', A1_PLANNING, { equipment: { requirements: ['smoke machine'] } })
        assert.equal(response.status, 403)
        assert.deepEqual(response.json.forbiddenFields, ['equipment.requirements'])
        assert.match(response.json.message, /equipment\.requirements/)

        const after = await get('technicalStaff', A1_PLANNING)
        assert.deepEqual(after.json.request.equipment, seeded[A1_PLANNING].equipment, 'record unchanged')
      })

      test('Venue staff PATCHes a venue field and an equipment field together — nothing is applied', async () => {
        const response = await patch('venueStaff', A1_PLANNING, {
          venue: { layoutPreference: 'banquet' },
          equipment: { requirements: ['smoke machine'] },
        })
        assert.equal(response.status, 403)
        assert.deepEqual(response.json.forbiddenFields, ['equipment.requirements'])

        const after = await get('venueStaff', A1_PLANNING)
        assert.equal(after.json.request.venue.layoutPreference, seeded[A1_PLANNING].venue.layoutPreference)
      })

      test('Coordinator PATCHes the status field — status transitions are not section edits', async () => {
        const response = await patch('coordinator', A1_SUBMITTED, { status: CONFIRMED })
        assert.equal(response.status, 403)
        assert.deepEqual(response.json.forbiddenFields, ['status'])
      })

      test('Venue+technical dual-role account PATCHes a venue field and an equipment field', async () => {
        const original = seeded[A1_PLANNING]
        const response = await patch('venueTechnicalStaff', A1_PLANNING, {
          venue: { layoutPreference: 'banquet' },
          equipment: { requirements: ['projector', 'lectern'] },
        })
        assert.equal(response.status, 200)
        assert.equal(response.json.request.venue.layoutPreference, 'banquet')
        assert.deepEqual(response.json.request.equipment.requirements, ['projector', 'lectern'])
        assert.deepEqual(response.json.editableSections, ['venue', 'equipment'])

        const persisted = await get('coordinator', A1_PLANNING)
        assert.equal(persisted.json.request.venue.layoutPreference, 'banquet', 'venue change persisted')
        assert.deepEqual(persisted.json.request.equipment.requirements, ['projector', 'lectern'], 'equipment change persisted')

        const restored = await patch('venueTechnicalStaff', A1_PLANNING, {
          venue: { layoutPreference: original.venue.layoutPreference },
          equipment: { requirements: original.equipment.requirements },
        })
        assert.equal(restored.status, 200, 'seeded values restored')
      })

      test('Organiser edits their own request after it is returned for clarification', async () => {
        const response = await patch('organiserA1', A1_RETURNED, { core: { purpose: 'Clarified purpose' } })
        assert.equal(response.status, 200)
        assert.equal(response.json.request.core.purpose, 'Clarified purpose')

        const restored = await patch('organiserA1', A1_RETURNED, { core: { purpose: seeded[A1_RETURNED].core.purpose } })
        assert.equal(restored.status, 200, 'seeded value restored')
      })

      test('Coordinator edits any section on an unassigned event', async () => {
        assert.deepEqual(seeded[A1_SUBMITTED].assignedStaffUids, [], 'precondition: no staff assigned')
        const response = await patch('coordinator', A1_SUBMITTED, {
          internal: { planningNotes: 'Coordinator note' },
          equipment: { technicalSupportNeeded: false },
        })
        assert.equal(response.status, 200)
        assert.equal(response.json.request.internal.planningNotes, 'Coordinator note')

        const restored = await patch('coordinator', A1_SUBMITTED, {
          internal: { planningNotes: seeded[A1_SUBMITTED].internal.planningNotes },
          equipment: { technicalSupportNeeded: seeded[A1_SUBMITTED].equipment.technicalSupportNeeded },
        })
        assert.equal(restored.status, 200, 'seeded values restored')
      })

      test('Attendee PATCHes a draft they cannot see — refused without naming fields', async () => {
        const response = await patch('attendee', A1_DRAFT, { core: { title: 'x' } })
        assert.equal(response.status, 403)
        assert.equal(response.json.forbiddenFields, undefined)
      })

      test('PATCH with a section that is not an object of fields', async () => {
        const response = await patch('venueStaff', A1_PLANNING, { venue: 'banquet' })
        assert.equal(response.status, 400)
      })
    })
  })
}
