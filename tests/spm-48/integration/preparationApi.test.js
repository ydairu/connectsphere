// SPM-48 after SPM-89: equipment remains an event section; venue preparation belongs to bookings.
// Real HTTP and middleware, with mocked tokens and in-memory request persistence.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createMemoryEventRequestStore } from '../../../backend/src/testing/memoryEventRequestStore.js'
import { PREPARATION_NOTES_MAX_LENGTH } from '../../../shared/preparation.js'
import { PREPARATION, PLANNING } from '../../../shared/status.js'
import { apiClient, startInMemoryApi } from '../../shared/helpers/requestApiServer.js'

const base = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed')
const id = 'spm48-preparation'
let api, client, store
beforeEach(async () => {
  store = createMemoryEventRequestStore([{ ...structuredClone(base), id, status: PREPARATION }])
  api = await startInMemoryApi({ eventRequestStore: store })
  client = apiClient(api)
})
afterEach(() => api.close())
const get = (account) => client.get(account, id)
const patch = (account, body) => client.patch(account, id, body)

describe('SPM-48 equipment preparation and SPM-89 legacy boundary', () => {
  it('assigned Technical Support Staff update status and notes; Coordinator reads them', async () => {
    const saved = await patch('technicalStaff', { equipmentPreparation: { status: 'in_progress', notes: 'Testing' } })
    expect(saved.status).toBe(200)
    expect(saved.json.request.equipmentPreparation).toEqual({ status: 'in_progress', notes: 'Testing' })
    expect(saved.json.editableSections).toEqual(['equipmentPreparation'])
    expect((await get('coordinator3')).json.request.equipmentPreparation).toEqual({ status: 'in_progress', notes: 'Testing' })
    expect((await get('coordinator3')).json.request).not.toHaveProperty('venuePreparation')
  })
  it('defaults equipment preparation and preserves notes on a partial save', async () => {
    expect((await get('coordinator3')).json.request.equipmentPreparation).toEqual({ status: 'not_started', notes: '' })
    await patch('technicalStaff', { equipmentPreparation: { notes: 'Tested' } })
    expect((await patch('technicalStaff', { equipmentPreparation: { status: 'ready' } })).json.request.equipmentPreparation)
      .toEqual({ status: 'ready', notes: 'Tested' })
  })
  it('refuses legacy event-level venue preparation for every role, including Venue Staff', async () => {
    for (const account of ['venueStaff', 'technicalStaff', 'coordinator3', 'organiserA1']) {
      const response = await patch(account, { venuePreparation: { status: 'ready' } })
      expect(response.status, account).toBe(403)
      expect(response.json.forbiddenFields).toEqual(['venuePreparation.status'])
    }
    expect((await store.get(id)).request.venuePreparation).toBeUndefined()
  })
  it('keeps equipment read-only before Preparation', async () => {
    const found = await store.get(id)
    found.request.status = PLANNING
    store = createMemoryEventRequestStore([found.request])
    await api.close()
    api = await startInMemoryApi({ eventRequestStore: store })
    client = apiClient(api)
    expect((await patch('technicalStaff', { equipmentPreparation: { status: 'ready' } })).status).toBe(403)
    expect((await get('technicalStaff')).json.preparation.equipmentPreparation.readOnlyReason).toBe('preparation_not_started_yet')
  })
  it('rejects invalid equipment values without writing', async () => {
    for (const fields of [{ status: 'done' }, { notes: 2 }, { notes: 'x'.repeat(PREPARATION_NOTES_MAX_LENGTH + 1) }, { extra: true }]) {
      expect((await patch('technicalStaff', { equipmentPreparation: fields })).status).toBe(400)
    }
    expect((await store.get(id)).request.equipmentPreparation).toBeUndefined()
  })
  it('hides equipment and legacy venue preparation from Organiser and Attendee', async () => {
    await patch('technicalStaff', { equipmentPreparation: { notes: 'Internal' } })
    for (const account of ['organiserA1', 'attendee']) {
      const response = await get(account)
      expect(response.json.request).not.toHaveProperty('equipmentPreparation')
      expect(response.json.request).not.toHaveProperty('venuePreparation')
      expect(response.text).not.toContain('Internal')
    }
  })
  it('records equipment changes for the Coordinator and hides them from the Organiser', async () => {
    await patch('technicalStaff', { equipmentPreparation: { status: 'ready' } })
    const coordinatorHistory = await client.call('GET', `/api/requests/${id}/history`, 'coordinator3')
    expect(coordinatorHistory.json.entries).toEqual(expect.arrayContaining([expect.objectContaining({
      field: 'equipmentPreparation.status', oldValue: 'not_started', newValue: 'ready',
      actor: expect.objectContaining({ role: 'technical_staff', name: SEED_ACCOUNTS.technicalStaff.name }),
    })]))
    expect((await client.call('GET', `/api/requests/${id}/history`, 'organiserA1')).json.entries).toEqual([])
  })
})
