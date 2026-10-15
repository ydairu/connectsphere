// SPM-37 — Exclude unavailable equipment from the available quantity: the /api/equipment routes over real
// HTTP, with mocked token verification and an in-memory database. Not database verification.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { EQUIPMENT_TYPES, EQUIPMENT_UNITS } from '../../../backend/src/services/equipmentService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { EQUIPMENT_UNIT_STATUS, EQUIPMENT_UNIT_STATUS_CHANGED } from '../../../shared/equipment.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

const { AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE } = EQUIPMENT_UNIT_STATUS
const TOKEN_PREFIX = 'test-token:'

const USERS = {
  technical: { uid: 'technical-1', email: 'technical@example.test', name: 'Technical One', roles: [TECHNICAL_STAFF] },
  coordinator: { uid: 'coordinator-1', email: 'coordinator@example.test', name: 'Coordinator One', roles: [COORDINATOR] },
  venueStaff: { uid: 'venue-1', email: 'venue@example.test', name: 'Venue One', roles: [VENUE_STAFF] },
  organiser: { uid: 'organiser-1', email: 'organiser@example.test', name: 'Organiser One', roles: [ORGANISER] },
  attendee: { uid: 'attendee-1', email: 'attendee@example.test', name: 'Attendee One', roles: [ATTENDEE] },
  venueTechnical: { uid: 'venue-tech-1', email: 'vt@example.test', name: 'Venue Tech', roles: [VENUE_STAFF, TECHNICAL_STAFF] },
}

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return Object.values(USERS).find((user) => user.uid === uid) ?? null
  },
})

// AC2's example: 10 microphones, one Damaged and one Under Repair. One projector is Unavailable (AC3).
function seedUnits() {
  const microphones = Array.from({ length: 10 }, (_, index) => [
    `mic-${index + 1}`,
    {
      equipmentTypeId: 'microphones',
      assetTag: `MIC-${String(index + 1).padStart(3, '0')}`,
      status: index === 8 ? DAMAGED : index === 9 ? UNDER_REPAIR : AVAILABLE,
      statusNote: null,
    },
  ])
  return Object.fromEntries([
    ...microphones,
    ['proj-1', { equipmentTypeId: 'projectors', assetTag: 'PRJ-001', status: AVAILABLE, statusNote: null }],
    ['proj-2', { equipmentTypeId: 'projectors', assetTag: 'PRJ-002', status: UNAVAILABLE, statusNote: 'Lent to another site' }],
  ])
}

let db
let server
let baseUrl

beforeEach(async () => {
  db = createFakeFirestore({
    [EQUIPMENT_TYPES]: {
      microphones: { name: 'Wireless microphone', location: 'Store B2' },
      projectors: { name: 'Projector', location: null },
    },
    [EQUIPMENT_UNITS]: seedUnits(),
  })
  const app = createApp({ authenticate, getEquipmentDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(() => new Promise((resolve) => server.close(resolve)))

async function call(path, { method = 'GET', as = USERS.technical, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${as.uid}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() }
}

function typeIn(list, id) {
  return list.equipment.find((item) => item.id === id)
}

const EVENT_PERIOD = '?from=2026-11-20T09:00:00.000Z&to=2026-11-20T17:00:00.000Z'

describe('SPM-37 — available quantity API (integration)', () => {
  it('spm37_ac2_api_shows_eight_of_ten_microphones_available_for_an_event_date', async () => {
    const response = await call(`/api/equipment${EVENT_PERIOD}`)

    expect(response.status).toBe(200)
    expect(response.json.period).toEqual({ from: '2026-11-20T09:00:00.000Z', to: '2026-11-20T17:00:00.000Z' })
    expect(typeIn(response.json, 'microphones')).toMatchObject({
      name: 'Wireless microphone',
      totalUnits: 10,
      availableUnits: 8,
      unavailableUnits: 2,
      byStatus: { [AVAILABLE]: 8, [DAMAGED]: 1, [UNDER_REPAIR]: 1, [UNAVAILABLE]: 0 },
    })
  })

  it('spm37_ac3_api_counts_an_unavailable_unit_as_unavailable_for_any_period', async () => {
    const periods = ['', EVENT_PERIOD, '?from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z']
    for (const period of periods) {
      const response = await call(`/api/equipment${period}`)
      expect(typeIn(response.json, 'projectors'), period || 'no period').toMatchObject({ totalUnits: 2, availableUnits: 1 })
    }
  })

  it('spm37_ac4_api_counts_a_repaired_unit_again_once_it_is_marked_available', async () => {
    const before = await call('/api/equipment')
    expect(typeIn(before.json, 'microphones').availableUnits).toBe(8)

    const repaired = await call('/api/equipment/microphones/units/mic-9', { method: 'PATCH', body: { status: AVAILABLE } })
    expect(repaired.status).toBe(200)
    expect(repaired.json.unit).toMatchObject({ id: 'mic-9', status: AVAILABLE, updatedByUid: USERS.technical.uid })

    const after = await call('/api/equipment')
    expect(typeIn(after.json, 'microphones').availableUnits).toBe(9)
  })

  it('spm37_api_marking_an_available_unit_damaged_removes_it_from_the_count', async () => {
    const response = await call('/api/equipment/microphones/units/mic-1', {
      method: 'PATCH',
      body: { status: DAMAGED, note: 'Cracked casing' },
    })

    expect(response.status).toBe(200)
    expect(response.json.unit).toMatchObject({ status: DAMAGED, statusNote: 'Cracked casing' })
    expect(typeIn((await call('/api/equipment')).json, 'microphones').availableUnits).toBe(7)
  })

  it('spm37_api_records_each_status_change_in_the_unit_activity_history', async () => {
    await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', body: { status: UNDER_REPAIR, note: 'Sent for repair' } })

    const activity = [...db.collectionData(`${EQUIPMENT_UNITS}/mic-1/activity`).values()]
    expect(activity).toHaveLength(1)
    expect(activity[0]).toMatchObject({
      type: EQUIPMENT_UNIT_STATUS_CHANGED,
      previousStatus: AVAILABLE,
      newStatus: UNDER_REPAIR,
      note: 'Sent for repair',
      actor: { type: 'user', uid: USERS.technical.uid, role: TECHNICAL_STAFF },
    })
    expect(Date.parse(activity[0].at)).not.toBeNaN()
  })

  it('spm37_api_saving_an_unchanged_status_writes_no_history', async () => {
    const response = await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', body: { status: AVAILABLE } })

    expect(response.status).toBe(200)
    expect(db.collectionData(`${EQUIPMENT_UNITS}/mic-1/activity`).size).toBe(0)
  })

  it('spm37_api_lists_one_type_with_its_units_and_counts', async () => {
    const response = await call('/api/equipment/projectors', { as: USERS.coordinator })

    expect(response.status).toBe(200)
    expect(response.json.equipment).toMatchObject({ id: 'projectors', name: 'Projector', totalUnits: 2, availableUnits: 1 })
    expect(response.json.equipment.units.map((unit) => [unit.assetTag, unit.status])).toEqual([
      ['PRJ-001', AVAILABLE],
      ['PRJ-002', UNAVAILABLE],
    ])
  })

  it('spm37_api_technical_staff_add_a_type_and_units_which_start_available', async () => {
    const created = await call('/api/equipment', { method: 'POST', body: { name: 'Laptop', location: 'IT cage' } })
    expect(created.status).toBe(201)
    const id = created.json.equipment.id
    expect(created.json.equipment).toMatchObject({ name: 'Laptop', location: 'IT cage', totalUnits: 0, createdByUid: USERS.technical.uid })

    const unit = await call(`/api/equipment/${id}/units`, { method: 'POST', body: { assetTag: 'LAP-001' } })
    expect(unit.status).toBe(201)
    expect(unit.json.unit).toMatchObject({ equipmentTypeId: id, assetTag: 'LAP-001', status: AVAILABLE })

    expect(typeIn((await call('/api/equipment')).json, id)).toMatchObject({ totalUnits: 1, availableUnits: 1 })
  })

  it('spm37_api_refuses_a_duplicate_asset_tag_within_a_type', async () => {
    const response = await call('/api/equipment/microphones/units', { method: 'POST', body: { assetTag: 'mic-001' } })

    expect(response.status).toBe(409)
    expect(response.json.errors.assetTag).toBeTruthy()
    expect(typeIn((await call('/api/equipment')).json, 'microphones').totalUnits).toBe(10)
  })
})

describe('SPM-37 — validation and failure paths (integration)', () => {
  it('spm37_api_rejects_an_invalid_status_and_leaves_the_unit_unchanged', async () => {
    const response = await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', body: { status: 'lost' } })

    expect(response.status).toBe(400)
    expect(response.json.errors.status).toBeTruthy()
    expect(db.collectionData(EQUIPMENT_UNITS).get('mic-1').status).toBe(AVAILABLE)
  })

  it('spm37_api_rejects_an_invalid_period', async () => {
    const reversed = await call('/api/equipment?from=2026-11-20T17:00:00.000Z&to=2026-11-20T09:00:00.000Z')
    const half = await call('/api/equipment?from=2026-11-20T09:00:00.000Z')

    expect(reversed.status).toBe(400)
    expect(reversed.json.errors.to).toBeTruthy()
    expect(half.status).toBe(400)
  })

  it('spm37_api_rejects_a_type_without_a_name_and_a_unit_without_an_asset_tag', async () => {
    const type = await call('/api/equipment', { method: 'POST', body: { name: '  ' } })
    const unit = await call('/api/equipment/microphones/units', { method: 'POST', body: {} })

    expect(type.status).toBe(400)
    expect(type.json.errors.name).toBe('Required.')
    expect(unit.status).toBe(400)
    expect(unit.json.errors.assetTag).toBe('Required.')
  })

  it('spm37_api_returns_404_for_a_missing_type_or_a_unit_of_another_type', async () => {
    expect((await call('/api/equipment/missing')).status).toBe(404)
    expect((await call('/api/equipment/missing/units', { method: 'POST', body: { assetTag: 'X-1' } })).status).toBe(404)
    expect((await call('/api/equipment/microphones/units/missing', { method: 'PATCH', body: { status: DAMAGED } })).status).toBe(404)
    // proj-1 exists, but under projectors: it cannot be changed through the microphones path.
    expect((await call('/api/equipment/microphones/units/proj-1', { method: 'PATCH', body: { status: DAMAGED } })).status).toBe(404)
    expect(db.collectionData(EQUIPMENT_UNITS).get('proj-1').status).toBe(AVAILABLE)
  })
})

describe('SPM-37 — authorisation (integration)', () => {
  it('spm37_api_coordinators_may_view_but_not_change_equipment', async () => {
    expect((await call('/api/equipment', { as: USERS.coordinator })).status).toBe(200)
    expect((await call('/api/equipment', { method: 'POST', as: USERS.coordinator, body: { name: 'X' } })).status).toBe(403)
    expect((await call('/api/equipment/microphones/units', { method: 'POST', as: USERS.coordinator, body: { assetTag: 'X' } })).status).toBe(403)
    expect(
      (await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', as: USERS.coordinator, body: { status: DAMAGED } })).status,
    ).toBe(403)
    expect(db.collectionData(EQUIPMENT_UNITS).get('mic-1').status).toBe(AVAILABLE)
  })

  it('spm37_api_organisers_attendees_and_venue_staff_cannot_reach_equipment', async () => {
    for (const as of [USERS.organiser, USERS.attendee, USERS.venueStaff]) {
      expect((await call('/api/equipment', { as })).status, as.uid).toBe(403)
      expect((await call('/api/equipment/microphones', { as })).status, as.uid).toBe(403)
      expect((await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', as, body: { status: DAMAGED } })).status, as.uid).toBe(403)
    }
  })

  it('spm37_api_a_venue_and_technical_staff_member_may_change_status_through_the_technical_role', async () => {
    const response = await call('/api/equipment/microphones/units/mic-1', { method: 'PATCH', as: USERS.venueTechnical, body: { status: DAMAGED } })
    expect(response.status).toBe(200)
  })

  it('spm37_api_requires_a_signed_in_user', async () => {
    const response = await fetch(`${baseUrl}/api/equipment`)
    expect(response.status).toBe(401)
  })
})
