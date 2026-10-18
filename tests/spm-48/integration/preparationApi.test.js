// SPM-48 API suite — in-memory harness. Real HTTP against the real Express app, authenticate, authorise
// and validatePreparation middleware, shared/permissions.js, shared/preparation.js and
// shared/changeHistory.js. Mocked: Firebase token verification (a test token names the uid) and persistence
// (backend/src/testing/memoryEventRequestStore.js). This is not database verification.
//
// Seed: A1 confirmed has both sign-offs approved (editable); A1 planning has none (read-only). Extra
// requests below cover Planning with only the venue sign-off, and closed events whose sign-offs stay approved.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_FIELD_HISTORY, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createMemoryEventRequestStore } from '../../../backend/src/testing/memoryEventRequestStore.js'
import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import {
  PREPARATION_EVENT_CLOSED,
  PREPARATION_EQUIPMENT_NOT_RESERVED,
  PREPARATION_NOTES_MAX_LENGTH,
  PREPARATION_SIGN_OFF_PENDING,
} from '../../../shared/preparation.js'
import { CANCELLED, COMPLETED, PLANNING, REJECTED } from '../../../shared/status.js'
import { apiClient, startInMemoryApi } from '../../shared/helpers/requestApiServer.js'

const CONFIRMED_ID = 'seed-req-a1-confirmed'
const PLANNING_ID = 'seed-req-a1-planning'
const VENUE_ONLY_ID = 'test-req-venue-signed-off'
const seeded = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))
const confirmed = seeded[CONFIRMED_ID]

const approvals = (venue, technical) => ({
  ...(venue ? { venue: { decision: 'approved', byUid: SEED_ACCOUNTS.venueStaff.uid, at: '2026-09-06T12:00:00+08:00' } } : {}),
  ...(technical ? { technical: { decision: 'approved', byUid: SEED_ACCOUNTS.technicalStaff.uid, at: '2026-09-06T12:30:00+08:00' } } : {}),
})

// Copies of A1 confirmed: same assignments, coordinator and owner. SPM-62: equipment preparation opens on the
// reservation A1 confirmed carries, so the venue-only copy has nothing reserved.
const extra = (id, status, arrangementApprovals, { reserved = true } = {}) => {
  const { reservedEquipment, ...copy } = structuredClone(confirmed)
  return { ...copy, ...(reserved ? { reservedEquipment } : {}), id, status, arrangementApprovals }
}
const EXTRA_REQUESTS = [
  extra(VENUE_ONLY_ID, PLANNING, approvals(true, false), { reserved: false }),
  extra('test-req-completed', COMPLETED, approvals(true, true)),
  extra('test-req-cancelled', CANCELLED, approvals(true, true)),
  extra('test-req-rejected', REJECTED, approvals(true, true)),
]

let api
let store
let client

beforeEach(async () => {
  store = createMemoryEventRequestStore([...SEED_REQUESTS, ...EXTRA_REQUESTS], { history: SEED_FIELD_HISTORY })
  api = await startInMemoryApi({ eventRequestStore: store })
  client = apiClient(api)
})

afterEach(() => api.close())

const get = (accountKey, id) => client.get(accountKey, id)
const patch = (accountKey, id, body) => client.patch(accountKey, id, body)
const history = (accountKey, id) => client.call('GET', `/api/requests/${id}/history`, accountKey)
const stored = async (id) => (await store.get(id)).request
const recorded = async (id) => (await store.listFieldHistory(id)).filter((entry) => entry.type === FIELD_CHANGED && !String(entry.id).startsWith('seed-'))

describe('SPM-48 AC1/AC3/AC4 — assigned staff update their own preparation section when allowed', () => {
  it('Venue Staff update venue preparation status and notes on an approved event, and the Coordinator sees it', async () => {
    const response = await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'in_progress', notes: 'Chairs ordered' } })
    expect(response.status).toBe(200)
    expect(response.json.request.venuePreparation).toEqual({ status: 'in_progress', notes: 'Chairs ordered' })
    expect(response.json.editableSections).toEqual(['venuePreparation'])

    const coordinatorView = await get('coordinator3', CONFIRMED_ID)
    expect(coordinatorView.json.request.venuePreparation).toEqual({ status: 'in_progress', notes: 'Chairs ordered' })
  })

  it('Technical Support Staff update equipment preparation on an approved event, and the Coordinator sees it', async () => {
    const response = await patch('technicalStaff', CONFIRMED_ID, { equipmentPreparation: { status: 'ready', notes: 'Projector tested' } })
    expect(response.status).toBe(200)
    expect(response.json.editableSections).toEqual(['equipmentPreparation'])

    const coordinatorView = await get('coordinator3', CONFIRMED_ID)
    expect(coordinatorView.json.request.equipmentPreparation).toEqual({ status: 'ready', notes: 'Projector tested' })
  })

  it('AC2: a section never saved reads as Not Started with no notes', async () => {
    const response = await get('coordinator3', CONFIRMED_ID)
    expect(response.json.request.venuePreparation).toEqual({ status: 'not_started', notes: '' })
    expect(response.json.request.equipmentPreparation).toEqual({ status: 'not_started', notes: '' })
  })

  it('a partial save keeps the other field', async () => {
    await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { notes: 'Chairs ordered' } })
    const response = await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'ready' } })
    expect(response.json.request.venuePreparation).toEqual({ status: 'ready', notes: 'Chairs ordered' })
  })

  it('at Planning, the venue sign-off alone opens venue preparation but not equipment preparation', async () => {
    expect((await patch('venueStaff', VENUE_ONLY_ID, { venuePreparation: { status: 'in_progress' } })).status).toBe(200)
    const refused = await patch('technicalStaff', VENUE_ONLY_ID, { equipmentPreparation: { status: 'in_progress' } })
    expect(refused.status).toBe(403)
    expect(refused.json.forbiddenFields).toEqual(['equipmentPreparation.status'])
  })
})

describe('SPM-48 AC5 — read-only before sign-off and on closed events', () => {
  it('before sign-off: 403 naming the field, nothing written, with the reason in the response', async () => {
    for (const [account, section, reason] of [
      ['venueStaff', 'venuePreparation', PREPARATION_SIGN_OFF_PENDING],
      // SPM-62: equipment preparation waits for the reservation, not the technical sign-off.
      ['technicalStaff', 'equipmentPreparation', PREPARATION_EQUIPMENT_NOT_RESERVED],
    ]) {
      const response = await patch(account, PLANNING_ID, { [section]: { status: 'ready' } })
      expect(response.status, account).toBe(403)
      expect(response.json.forbiddenFields).toEqual([`${section}.status`])
      expect((await stored(PLANNING_ID))[section], 'nothing written').toBeUndefined()

      const view = await get(account, PLANNING_ID)
      expect(view.json.editableSections).toEqual([])
      expect(view.json.preparation).toEqual({ [section]: { editable: false, readOnlyReason: reason } })
    }
    expect(await recorded(PLANNING_ID)).toEqual([])
  })

  it.each(['test-req-completed', 'test-req-cancelled', 'test-req-rejected'])('closed (%s), sign-off approved: 403, nothing written', async (id) => {
    const response = await patch('venueTechnicalStaff', id, { venuePreparation: { status: 'ready' }, equipmentPreparation: { notes: 'Late' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['venuePreparation.status', 'equipmentPreparation.notes'])
    expect((await stored(id)).venuePreparation).toBeUndefined()

    const view = await get('venueTechnicalStaff', id)
    expect(view.json.preparation).toEqual({
      venuePreparation: { editable: false, readOnlyReason: PREPARATION_EVENT_CLOSED },
      equipmentPreparation: { editable: false, readOnlyReason: PREPARATION_EVENT_CLOSED },
    })
  })
})

describe('SPM-48 AC6/AC7 — cross-section and main-detail writes are refused', () => {
  it.each([
    ['Venue Staff', 'venueStaff', { core: { title: 'Renamed' } }, ['core.title']],
    ['Venue Staff', 'venueStaff', { venue: { layoutPreference: 'banquet' } }, ['venue.layoutPreference']],
    ['Venue Staff', 'venueStaff', { equipment: { requirements: ['lectern'] } }, ['equipment.requirements']],
    ['Venue Staff', 'venueStaff', { equipmentPreparation: { status: 'ready' } }, ['equipmentPreparation.status']],
    ['Technical Support Staff', 'technicalStaff', { core: { title: 'Renamed' } }, ['core.title']],
    ['Technical Support Staff', 'technicalStaff', { venue: { layoutPreference: 'banquet' } }, ['venue.layoutPreference']],
    ['Technical Support Staff', 'technicalStaff', { equipment: { requirements: ['lectern'] } }, ['equipment.requirements']],
    ['Technical Support Staff', 'technicalStaff', { venuePreparation: { status: 'ready' } }, ['venuePreparation.status']],
  ])('%s PATCH %j on an approved event: 403 naming the field, nothing written', async (_label, account, body, fields) => {
    const before = await stored(CONFIRMED_ID)
    const response = await patch(account, CONFIRMED_ID, body)
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(fields)
    expect(await stored(CONFIRMED_ID)).toEqual(before)
    expect(await recorded(CONFIRMED_ID)).toEqual([])
  })

  it('a permitted field in the same patch is not applied either', async () => {
    const response = await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'ready' }, venue: { layoutPreference: 'banquet' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['venue.layoutPreference'])
    expect((await stored(CONFIRMED_ID)).venuePreparation).toBeUndefined()
  })

  it('Technical Support Staff never receive venue preparation, nor Venue Staff equipment preparation', async () => {
    expect(Object.keys((await get('venueStaff', CONFIRMED_ID)).json.request)).not.toContain('equipmentPreparation')
    expect(Object.keys((await get('technicalStaff', CONFIRMED_ID)).json.request)).not.toContain('venuePreparation')
  })
})

describe('SPM-48 — invalid values return 400 and write nothing', () => {
  it.each([
    ['an unknown status', { status: 'done' }, 'venuePreparation.status'],
    ['a status that is not text', { status: 3 }, 'venuePreparation.status'],
    ['notes that are not text', { notes: ['a'] }, 'venuePreparation.notes'],
    ['notes over the limit', { notes: 'x'.repeat(PREPARATION_NOTES_MAX_LENGTH + 1) }, 'venuePreparation.notes'],
    ['an unknown field', { colour: 'red' }, 'venuePreparation.colour'],
  ])('%s', async (_label, fields, path) => {
    const response = await patch('venueStaff', CONFIRMED_ID, { venuePreparation: fields })
    expect(response.status).toBe(400)
    expect(Object.keys(response.json.errors)).toEqual([path])
    expect((await stored(CONFIRMED_ID)).venuePreparation).toBeUndefined()
    expect(await recorded(CONFIRMED_ID)).toEqual([])
  })

  it('notes at the limit are accepted', async () => {
    const response = await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { notes: 'x'.repeat(PREPARATION_NOTES_MAX_LENGTH) } })
    expect(response.status).toBe(200)
  })

  it('a forbidden section is refused with 403 before its value is checked', async () => {
    const response = await patch('venueStaff', PLANNING_ID, { venuePreparation: { status: 'done' } })
    expect(response.status).toBe(403)
  })
})

describe('SPM-48 — the assigned Coordinator reads both sections but cannot edit them', () => {
  it('both sections are in the response and neither is editable', async () => {
    const response = await get('coordinator3', CONFIRMED_ID)
    expect(response.status).toBe(200)
    expect(response.json.request).toHaveProperty('venuePreparation')
    expect(response.json.request).toHaveProperty('equipmentPreparation')
    expect(response.json.editableSections).not.toContain('venuePreparation')
    expect(response.json.editableSections).not.toContain('equipmentPreparation')
    expect(response.json.preparation).toBeNull()
  })

  it('a Coordinator PATCH is 403 naming the field, nothing written', async () => {
    const response = await patch('coordinator3', CONFIRMED_ID, { venuePreparation: { status: 'ready' }, equipmentPreparation: { notes: 'x' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['venuePreparation.status', 'equipmentPreparation.notes'])
    expect((await stored(CONFIRMED_ID)).venuePreparation).toBeUndefined()
  })
})

describe('SPM-48 AC8 — Organisers and Attendees never receive preparation', () => {
  it.each([
    ['the owning Organiser', 'organiserA1'],
    ['a same-organisation colleague', 'organiserA2'],
    ['an Attendee', 'attendee'],
  ])('%s: no preparation section in the request, the list or the raw body', async (_label, account) => {
    await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'in_progress', notes: 'Secret venue note' } })

    const one = await get(account, CONFIRMED_ID)
    expect(one.status).toBe(200)
    expect(one.json.request).not.toHaveProperty('venuePreparation')
    expect(one.json.request).not.toHaveProperty('equipmentPreparation')
    expect(one.json.preparation).toBeNull()
    expect(one.text).not.toContain('Secret venue note')
    expect(one.text).not.toContain('Preparation')

    const listed = await client.list(account)
    expect(listed.text).not.toContain('Secret venue note')
    expect(listed.text).not.toContain('venuePreparation')
  })
})

describe('SPM-48 AC9 — every preparation update is in the change history (SPM-28)', () => {
  it('one entry per changed field with old value, new value, who and when', async () => {
    await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'in_progress', notes: 'Chairs ordered' } })
    await patch('technicalStaff', CONFIRMED_ID, { equipmentPreparation: { status: 'ready' } })

    const entries = await recorded(CONFIRMED_ID)
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'venuePreparation.notes', oldValue: '', newValue: 'Chairs ordered', actor: expect.objectContaining({ uid: SEED_ACCOUNTS.venueStaff.uid, role: VENUE_STAFF }) }),
      expect.objectContaining({ field: 'venuePreparation.status', oldValue: 'not_started', newValue: 'in_progress', actor: expect.objectContaining({ role: VENUE_STAFF }) }),
      expect.objectContaining({ field: 'equipmentPreparation.status', oldValue: 'not_started', newValue: 'ready', actor: expect.objectContaining({ uid: SEED_ACCOUNTS.technicalStaff.uid, role: TECHNICAL_STAFF }) }),
    ]))
    expect(entries).toHaveLength(3)
    for (const entry of entries) expect(entry.at).toEqual(expect.any(String))
  })

  it('the assigned Coordinator sees the entries; the owning Organiser does not', async () => {
    await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'in_progress' } })
    await patch('technicalStaff', CONFIRMED_ID, { equipmentPreparation: { notes: 'Projector tested' } })

    const coordinatorHistory = await history('coordinator3', CONFIRMED_ID)
    expect(coordinatorHistory.status).toBe(200)
    expect(coordinatorHistory.json.entries.map((entry) => entry.field).sort()).toEqual(['equipmentPreparation.notes', 'venuePreparation.status'])

    const organiserHistory = await history('organiserA1', CONFIRMED_ID)
    expect(organiserHistory.status).toBe(200)
    expect(organiserHistory.json.entries).toEqual([])
    expect(organiserHistory.text).not.toContain('Projector tested')
  })

  it('a save that changes nothing records nothing', async () => {
    await patch('venueStaff', CONFIRMED_ID, { venuePreparation: { status: 'not_started', notes: '' } })
    expect(await recorded(CONFIRMED_ID)).toEqual([])
  })
})
