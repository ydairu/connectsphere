// SPM-64 API suite — in-memory harness (tests/shared/helpers/requestApiServer.js). Real HTTP against the
// real Express app, authenticate and authorise middleware and shared/permissions.js. Mocked: Firebase token
// verification and persistence. This is not database verification.
//
// SPM-64 adds no API: these cases pin down, per status, the SPM-42 behaviour the story relies on.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { CONFIRMED, PLANNING, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { apiClient, startInMemoryApi } from '../../shared/helpers/requestApiServer.js'

const byId = (id) => SEED_REQUESTS.find((request) => request.id === id)

// A1 owns one seeded event at each status after submission that SPM-64 AC3 names. SPM-19 (team decision,
// 28 Oct 2026) reopens only the registration section at Confirmed; that case is below.
const READ_ONLY = [
  [SUBMITTED, 'seed-req-a1-submitted'],
  [UNDER_REVIEW, 'seed-req-a1-under-review'],
  [PLANNING, 'seed-req-a1-planning'],
]
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const RETURNED_ID = 'seed-req-a1-returned'
const COLLEAGUES_ID = 'seed-req-a2-submitted'

// One field from every section an Organiser can see — none may be changed after submission.
const EDITS = {
  core: { title: 'Changed after submission' },
  venue: { layoutPreference: 'banquet' },
  equipment: { technicalSupportNeeded: false },
  registration: { enabled: true },
}

let harness
let api

beforeAll(async () => {
  harness = await startInMemoryApi()
  api = apiClient(harness)
})

afterAll(() => harness.close())

// Each test starts from the seeded records: the store is per harness, so re-create it when one edits.
afterEach(async () => {
  await harness.close()
  harness = await startInMemoryApi()
  api = apiClient(harness)
})

describe('SPM-64 AC3 — the Organiser\'s own event is read-only after submission', () => {
  describe.each(READ_ONLY)('at %s', (status, id) => {
    it('the GET offers no editable section', async () => {
      const response = await api.get('organiserA1', id)
      expect(response.status).toBe(200)
      expect(response.json.request.status).toBe(status)
      expect(response.json.editableSections).toEqual([])
    })

    it.each(Object.entries(EDITS))('a PATCH to %s is refused with 403 naming the field, and nothing changes', async (section, fields) => {
      const response = await api.patch('organiserA1', id, { [section]: fields })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(Object.keys(fields).map((field) => `${section}.${field}`))

      const after = await api.get('organiserA1', id)
      expect(after.json.request[section]).toEqual(byId(id)[section])
    })
  })

  describe(`at ${CONFIRMED}, only the registration section reopens (SPM-19)`, () => {
    it('the GET offers the registration section alone', async () => {
      const response = await api.get('organiserA1', CONFIRMED_ID)
      expect(response.json.request.status).toBe(CONFIRMED)
      expect(response.json.editableSections).toEqual(['registration'])
    })

    it.each(Object.entries(EDITS).filter(([section]) => section !== 'registration'))('a PATCH to %s is still refused with 403 naming the field', async (section, fields) => {
      const response = await api.patch('organiserA1', CONFIRMED_ID, { [section]: fields })
      expect(response.status).toBe(403)
      expect(response.json.forbiddenFields).toEqual(Object.keys(fields).map((field) => `${section}.${field}`))
      expect((await api.get('organiserA1', CONFIRMED_ID)).json.request[section]).toEqual(byId(CONFIRMED_ID)[section])
    })

    it('a same-organisation colleague still cannot edit it', async () => {
      expect((await api.patch('organiserA2', CONFIRMED_ID, { registration: { enabled: false } })).status).toBe(403)
    })
  })

  it('AC2 regression: at Returned the owner may still edit', async () => {
    const response = await api.patch('organiserA1', RETURNED_ID, { core: { title: 'A1 returned, amended' } })
    expect(response.status).toBe(200)
    expect(response.json.request.core.title).toBe('A1 returned, amended')
    expect(response.json.editableSections).toEqual(expect.arrayContaining(['core', 'venue', 'equipment', 'registration']))
  })
})

describe('SPM-64 AC6 — a same-organisation colleague\'s event is read-only', () => {
  it('A1 sees A2\'s submitted event with nothing editable, and every edit is refused', async () => {
    const response = await api.get('organiserA1', COLLEAGUES_ID)
    expect(response.status).toBe(200)
    expect(response.json.editableSections).toEqual([])
    for (const [section, fields] of Object.entries(EDITS)) {
      expect((await api.patch('organiserA1', COLLEAGUES_ID, { [section]: fields })).status).toBe(403)
    }
  })

  it('A2 likewise cannot edit any of A1\'s events', async () => {
    for (const [, id] of READ_ONLY) {
      expect((await api.get('organiserA2', id)).json.editableSections).toEqual([])
      expect((await api.patch('organiserA2', id, { core: { title: 'Edited by colleague' } })).status).toBe(403)
    }
  })
})

describe('SPM-64 — Organisers never receive the internal section', () => {
  const allA1 = [...READ_ONLY.map(([, id]) => id), RETURNED_ID, 'seed-req-a1-completed', 'seed-req-a1-cancelled', 'seed-req-a1-rejected']

  it.each(allA1)('owner and colleague GET %s without `internal` or its notes', async (id) => {
    for (const account of ['organiserA1', 'organiserA2']) {
      const response = await api.get(account, id)
      expect(response.status).toBe(200)
      expect(response.json.request).not.toHaveProperty('internal')
      expect(response.text).not.toContain('planningNotes')
      expect(response.text).not.toContain('Seed internal note')
    }
  })

  it('the list carries no internal section for any event', async () => {
    const response = await api.list('organiserA1')
    expect(response.status).toBe(200)
    expect(response.json.requests.length).toBeGreaterThan(0)
    for (const request of response.json.requests) expect(request).not.toHaveProperty('internal')
    expect(response.text).not.toContain('Seed internal note')
  })

  it('an Organiser cannot write the internal section either', async () => {
    const response = await api.patch('organiserA1', RETURNED_ID, { internal: { planningNotes: 'Organiser note' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['internal.planningNotes'])
  })
})

describe('SPM-64 AC5 — status and arrangements reach the Organiser', () => {
  it('the response carries the status, the requested details and the sign-off state', async () => {
    const response = await api.get('organiserA1', 'seed-req-a1-planning')
    const seeded = byId('seed-req-a1-planning')
    expect(response.json.request.status).toBe(PLANNING)
    expect(response.json.request.core.preferredDateTime).toBe(seeded.core.preferredDateTime)
    expect(response.json.request.venue).toEqual(seeded.venue)
    expect(response.json.request.equipment).toEqual(seeded.equipment)
    expect(response.json.arrangements).toEqual({
      venue: { required: true, decision: null, at: null },
      technical: { required: true, decision: null, at: null },
    })
  })
})
