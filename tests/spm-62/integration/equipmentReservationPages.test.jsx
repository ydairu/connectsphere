// SPM-62, presentation side: Reserve on the event page's Equipment requests card, and the Organiser's "Your
// event arrangements" card showing reserved equipment in place of the requested list. The API is mocked here;
// rules and enforcement are covered by the unit and API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { ORGANISER, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRequest: vi.fn(),
    getRequestHistory: vi.fn(),
    listEquipment: vi.fn(),
    listEquipmentRequests: vi.fn(),
    checkEquipmentAvailability: vi.fn(),
    decideEquipmentRequest: vi.fn(),
  }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'seed-technical-staff' }
const period = { startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z' }
const approved = {
  id: 'eq-1', status: 'approved', requiredPeriod: period, assignedTechnicalStaffName: 'Seed Technical Staff', replacesId: null,
  items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, technicalRequirements: null }],
  createdAt: '2026-10-17T00:00:00.000Z', approvedByName: 'Seed Technical Staff', approvedAt: '2026-10-17T01:00:00.000Z', actions: ['reserve'],
}
const reserved = {
  ...approved, status: 'reserved', actions: [], reservedByName: 'Seed Technical Staff', reservedAt: '2026-10-18T01:00:00.000Z',
  reservedUnits: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, assetTags: ['P-001', 'P-002'] }],
}
const fulfillable = { equipmentRequestId: 'eq-1', requiredPeriod: period, fulfillable: true, items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', requestedQuantity: 2, availableQuantity: 3, shortfall: 0, sufficient: true }] }

// The Equipment requests card is on the Equipment Required tab; the Organiser's arrangements are on the first.
function show(roles, response, path = '/requests/event') {
  api.getRequest.mockResolvedValue(response)
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const eventResponse = (extra = {}) => ({
  request: { id: 'event', status: PLANNING, core: { title: 'Partner summit' }, equipment: { requirements: ['projector', 'microphone'], technicalSupportNeeded: true } },
  editableSections: [],
  availableActions: [],
  ...extra,
})

async function card() {
  return (await screen.findByRole('heading', { name: 'Equipment requests' })).closest('.equipment-requests')
}

describe('SPM-62 Reserve on the Equipment requests card', () => {
  it('spm62_page_the_assignee_reserves_an_approved_request_and_sees_the_reserved_units', async () => {
    api.listEquipmentRequests.mockResolvedValueOnce({ canSubmit: false, requests: [approved] })
    api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests: [reserved] })
    api.checkEquipmentAvailability.mockResolvedValue({ availability: fulfillable })
    api.decideEquipmentRequest.mockResolvedValue({ equipmentRequest: reserved, availability: fulfillable })
    const actor = show([TECHNICAL_STAFF], eventResponse(), '/requests/event?tab=equipment-required')
    const section = await card()

    const reserve = await within(section).findByRole('button', { name: 'Reserve equipment' })
    await waitFor(() => expect(reserve.disabled).toBe(false))
    await actor.click(reserve)

    expect(api.decideEquipmentRequest).toHaveBeenCalledWith(user, 'event', 'eq-1', 'reserve')
    expect(await screen.findByText('Reserved. The equipment is now held for this event.')).toBeTruthy()
    expect(within(section).getByText('Reserved')).toBeTruthy()
    expect(within(section).getByText('Projector: P-001, P-002')).toBeTruthy()
  })

  it('spm62_page_a_shortfall_at_reserve_time_is_shown_and_nothing_is_reserved', async () => {
    const short = { ...fulfillable, fulfillable: false, items: [{ ...fulfillable.items[0], availableQuantity: 1, shortfall: 1, sufficient: false }] }
    api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests: [approved] })
    api.checkEquipmentAvailability.mockResolvedValue({ availability: fulfillable })
    api.decideEquipmentRequest.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 409, details: { message: 'This request cannot be fulfilled.', availability: short } }))
    const actor = show([TECHNICAL_STAFF], eventResponse(), '/requests/event?tab=equipment-required')
    const section = await card()

    const reserve = await within(section).findByRole('button', { name: 'Reserve equipment' })
    await waitFor(() => expect(reserve.disabled).toBe(false))
    await actor.click(reserve)

    expect(await within(section).findByText('Shortfall: this request cannot be fulfilled.')).toBeTruthy()
    expect(within(section).getByText(/1 available, 2 requested — short by 1/)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Reserve equipment' }).disabled).toBe(true)
  })
})

describe('SPM-62 Organiser arrangements card', () => {
  it('spm62_page_the_organiser_sees_reserved_types_and_quantities_in_place_of_the_requested_list', async () => {
    api.listEquipmentRequests.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 404 }))
    show([ORGANISER], eventResponse({ reservedEquipment: { items: [{ equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: '2026-10-18T01:00:00.000Z' } }))

    const row = await screen.findByLabelText('Equipment')
    expect(row.textContent).toContain('Reserved: 2 × Projector')
    expect(row.textContent).not.toContain('Requested:')
    expect(row.textContent).not.toContain('microphone')
    expect(document.body.textContent).not.toMatch(/P-00\d/)
  })

  it('spm62_page_before_a_reservation_the_organiser_still_sees_the_requested_list', async () => {
    api.listEquipmentRequests.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 404 }))
    show([ORGANISER], eventResponse({ reservedEquipment: null }))

    const row = await screen.findByLabelText('Equipment')
    expect(row.textContent).toContain('Requested: projector, microphone, technical support')
  })
})
