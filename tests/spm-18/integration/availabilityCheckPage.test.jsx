// SPM-18, presentation side: the "Check availability" control on each equipment request on the request page.
// The API is mocked here; the rules and their enforcement are covered by the unit and API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { COORDINATOR, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    checkEquipmentAvailability: vi.fn(),
    getRequest: vi.fn(),
    getRequestHistory: vi.fn(),
    listEquipment: vi.fn(),
    listEquipmentRequests: vi.fn(),
  }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'seed-technical-staff' }
const requiredPeriod = { startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z' }

const pending = {
  id: 'eq-1',
  status: 'pending_review',
  requiredPeriod,
  assignedTechnicalStaffName: 'Seed Technical Staff',
  replacesId: null,
  items: [
    { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, technicalRequirements: 'HDMI' },
    { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', quantity: 3, technicalRequirements: null },
  ],
  createdAt: '2026-10-17T00:00:00.000Z',
}

function show({ roles = [TECHNICAL_STAFF], requests = [pending] } = {}) {
  api.getRequest.mockResolvedValue({
    request: { id: 'req-1', status: PLANNING, core: { title: 'Partner summit' }, equipment: { requirements: [], technicalSupportNeeded: true } },
    editableSections: [],
    availableActions: [],
  })
  api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests })
  api.listEquipment.mockResolvedValue({ equipment: [] })
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1?tab=equipment-required']}>
        <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function requestPanel() {
  const heading = await screen.findByRole('heading', { name: 'Equipment requests' })
  return within(heading.closest('.equipment-requests')).findByLabelText('Equipment request eq-1')
}

const result = (overrides) => ({
  availability: {
    equipmentRequestId: 'eq-1',
    requiredPeriod,
    checkedAt: '2026-10-17T02:00:00.000Z',
    fulfillable: true,
    items: [
      { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', technicalRequirements: 'HDMI', requestedQuantity: 2, availableQuantity: 3, shortfall: 0, sufficient: true },
      { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', technicalRequirements: null, requestedQuantity: 3, availableQuantity: 4, shortfall: 0, sufficient: true },
    ],
    ...overrides,
  },
})

describe('SPM-18 Check availability control', () => {
  it('spm18_page_technical_staff_see_that_the_request_can_be_fulfilled', async () => {
    api.checkEquipmentAvailability.mockResolvedValue(result())
    const actor = show()
    const panel = await requestPanel()

    await actor.click(within(panel).getByRole('button', { name: 'Check availability' }))

    expect(await within(panel).findByText('Can be fulfilled: every equipment type has enough available units.')).toBeTruthy()
    expect(api.checkEquipmentAvailability).toHaveBeenCalledWith(user, 'req-1', 'eq-1')
    expect(within(panel).getByText(/3 available, 2 requested — enough/)).toBeTruthy()
    expect(within(panel).getByText(/Check the technical requirements yourself: HDMI/)).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Check again' })).toBeTruthy()
  })

  it('spm18_page_shows_a_shortfall_and_which_type_is_short', async () => {
    api.checkEquipmentAvailability.mockResolvedValue(
      result({
        fulfillable: false,
        items: [
          { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', technicalRequirements: null, requestedQuantity: 2, availableQuantity: 3, shortfall: 0, sufficient: true },
          { equipmentTypeId: 'mic', equipmentTypeName: 'Wireless microphone', technicalRequirements: null, requestedQuantity: 3, availableQuantity: 1, shortfall: 2, sufficient: false },
        ],
      }),
    )
    const actor = show()
    const panel = await requestPanel()

    await actor.click(within(panel).getByRole('button', { name: 'Check availability' }))

    expect(await within(panel).findByText('Shortfall: this request cannot be fulfilled.')).toBeTruthy()
    expect(within(panel).getByText(/1 available, 3 requested — short by 2/)).toBeTruthy()
  })

  it('spm18_page_shows_an_api_refusal_without_a_result', async () => {
    api.checkEquipmentAvailability.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 404, details: { message: 'Equipment request not found.' } }))
    const actor = show()
    const panel = await requestPanel()

    await actor.click(within(panel).getByRole('button', { name: 'Check availability' }))

    expect(await within(panel).findByRole('alert')).toBeTruthy()
    expect(within(panel).queryByText(/Can be fulfilled|Shortfall/)).toBeNull()
  })

  it('spm18_page_coordinators_do_not_get_the_check', async () => {
    show({ roles: [COORDINATOR] })
    const panel = await requestPanel()

    expect(within(panel).queryByRole('button', { name: 'Check availability' })).toBeNull()
  })

  it('spm18_page_closed_requests_cannot_be_checked', async () => {
    show({ requests: [{ ...pending, status: 'closed' }] })
    const panel = await requestPanel()

    expect(within(panel).queryByRole('button', { name: 'Check availability' })).toBeNull()
  })
})
