// SPM-17, presentation side: the Equipment requests card on the request page. The API is mocked here; the
// rules and their enforcement are covered by the unit, service and API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { COORDINATOR, ORGANISER, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRequest: vi.fn(),
    getRequestHistory: vi.fn(),
    listEquipment: vi.fn(),
    listEquipmentRequests: vi.fn(),
    submitEquipmentRequest: vi.fn(),
  }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'seed-coordinator' }

const pending = {
  id: 'eq-1',
  status: 'pending_review',
  requiredPeriod: { startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z' },
  assignedTechnicalStaffName: 'Seed Technical Staff',
  replacesId: null,
  items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, technicalRequirements: 'HDMI' }],
  createdAt: '2026-10-17T00:00:00.000Z',
}

function show({ roles = [COORDINATOR], list = { canSubmit: true, requests: [] } } = {}) {
  api.getRequest.mockResolvedValue({
    request: {
      id: 'req-1',
      status: PLANNING,
      core: { title: 'Partner summit' },
      equipment: { requirements: ['projector', 'wireless microphone'], technicalSupportNeeded: true },
    },
    editableSections: [],
    availableActions: [],
  })
  if (list instanceof Error) api.listEquipmentRequests.mockRejectedValue(list)
  else api.listEquipmentRequests.mockResolvedValue(list)
  api.listEquipment.mockResolvedValue({
    equipment: [
      { id: 'projector', name: 'Projector', availableUnits: 3 },
      { id: 'mic', name: 'Wireless microphone', availableUnits: 2 },
    ],
  })
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function card() {
  return (await screen.findByRole('heading', { name: 'Equipment requests' })).closest('.equipment-requests')
}

describe('SPM-17 Equipment requests card', () => {
  it('spm17_page_coordinator_adds_and_removes_rows_then_submits', async () => {
    const actor = show()
    api.submitEquipmentRequest.mockResolvedValue({ equipmentRequest: pending })
    const section = await card()

    await actor.selectOptions(await within(section).findByLabelText('Equipment type'), 'projector')
    await actor.clear(within(section).getByLabelText('Quantity'))
    await actor.type(within(section).getByLabelText('Quantity'), '2')
    await actor.type(within(section).getByLabelText('Technical requirements (optional)'), 'HDMI')
    await actor.click(within(section).getByRole('button', { name: 'Add item' }))
    expect(within(section).getAllByLabelText('Equipment type')).toHaveLength(2)
    await actor.click(within(section).getByRole('button', { name: 'Remove item 2' }))
    expect(within(section).getAllByLabelText('Equipment type')).toHaveLength(1)

    api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests: [pending] })
    await actor.click(within(section).getByRole('button', { name: 'Submit equipment request' }))

    expect(await within(section).findByText('Equipment request sent to Seed Technical Staff for review.')).toBeTruthy()
    expect(api.submitEquipmentRequest).toHaveBeenCalledWith(user, 'req-1', {
      submissionKey: expect.any(String),
      items: [{ equipmentTypeId: 'projector', quantity: '2', technicalRequirements: 'HDMI' }],
    })
    expect(within(section).getByText('Pending Review')).toBeTruthy()
    expect(within(section).getByText('2 × Projector')).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Submit equipment request' })).toBeNull()
  })

  it('spm17_page_a_400_marks_the_row_and_keeps_every_value_and_the_retry_key', async () => {
    const actor = show()
    const section = await card()
    await actor.selectOptions(await within(section).findByLabelText('Equipment type'), 'projector')
    await actor.type(within(section).getByLabelText('Technical requirements (optional)'), 'HDMI')
    await actor.click(within(section).getByRole('button', { name: 'Add item' }))
    const types = within(section).getAllByLabelText('Equipment type')
    const quantities = within(section).getAllByLabelText('Quantity')
    await actor.selectOptions(types[1], 'mic')
    await actor.clear(quantities[1])
    await actor.type(quantities[1], '4')

    api.submitEquipmentRequest.mockRejectedValueOnce(new ApiRequestError('API_REQUEST_FAILED', {
      status: 400,
      details: { message: 'Validation failed', errors: { 'items.1.quantity': 'Enter a whole number of 1 or more.' } },
    }))
    await actor.click(within(section).getByRole('button', { name: 'Submit equipment request' }))

    expect(await within(section).findByText('Enter a whole number of 1 or more.')).toBeTruthy()
    expect(quantities[1].getAttribute('aria-invalid')).toBe('true')
    expect(types.map((select) => select.value)).toEqual(['projector', 'mic'])
    expect(quantities.map((input) => input.value)).toEqual(['1', '4'])
    expect(within(section).getAllByLabelText('Technical requirements (optional)')[0].value).toBe('HDMI')

    api.submitEquipmentRequest.mockResolvedValueOnce({ equipmentRequest: pending })
    await actor.click(within(section).getByRole('button', { name: 'Submit equipment request' }))
    await waitFor(() => expect(api.submitEquipmentRequest).toHaveBeenCalledTimes(2))
    expect(api.submitEquipmentRequest.mock.calls[1][2].submissionKey).toBe(api.submitEquipmentRequest.mock.calls[0][2].submissionKey)
  })

  it('spm17_page_a_missing_type_or_bad_quantity_is_flagged_before_sending', async () => {
    const actor = show()
    const section = await card()
    await within(section).findByLabelText('Equipment type')
    await actor.clear(within(section).getByLabelText('Quantity'))
    await actor.type(within(section).getByLabelText('Quantity'), '0')
    await actor.click(within(section).getByRole('button', { name: 'Submit equipment request' }))

    expect(await within(section).findByText('Choose an equipment type.')).toBeTruthy()
    expect(within(section).getByText('Enter a whole number of 1 or more.')).toBeTruthy()
    expect(within(section).getByLabelText('Quantity').value).toBe('0')
    expect(api.submitEquipmentRequest).not.toHaveBeenCalled()
  })

  it('spm17_page_shows_the_organiser_s_equipment_needs_beside_the_form', async () => {
    show()
    const reference = within(await card()).getByLabelText("Organiser's equipment needs")
    expect(within(reference).getByText('wireless microphone')).toBeTruthy()
    expect(within(reference).getByText('Technical support needed: Yes')).toBeTruthy()
  })

  it('spm17_page_technical_staff_see_the_list_read_only', async () => {
    show({ roles: [TECHNICAL_STAFF], list: { canSubmit: false, requests: [{ ...pending, replacesId: 'eq-0' }] } })
    const section = await card()
    expect(within(section).getByText('Pending Review')).toBeTruthy()
    expect(within(section).getByText('The rejected request eq-0')).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Submit equipment request' })).toBeNull()
    expect(api.listEquipment).not.toHaveBeenCalled()
  })

  it('spm17_page_nothing_is_shown_when_the_api_refuses', async () => {
    show({ list: new ApiRequestError('API_REQUEST_FAILED', { status: 404, details: { message: 'Event not found.' } }) })
    await screen.findByRole('heading', { name: 'Partner summit' })
    await waitFor(() => expect(api.listEquipmentRequests).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Equipment requests' })).toBeNull()
  })

  it('spm17_page_organisers_never_load_equipment_requests', async () => {
    show({ roles: [ORGANISER] })
    await screen.findByRole('heading', { name: 'Partner summit' })
    expect(api.listEquipmentRequests).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Equipment requests' })).toBeNull()
  })
})
