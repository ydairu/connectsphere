// SPM-36, presentation side: Reject on the event page's Equipment requests card, what the Coordinator sees
// after a rejection, and the queue's groups. The API is mocked here.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { COORDINATOR, TECHNICAL_STAFF } from '../../../shared/permissions.js'
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
    listAssignedEquipmentRequests: vi.fn(),
    submitEquipmentRequest: vi.fn(),
  }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'seed-technical-staff' }
const period = { startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z' }
const pending = {
  id: 'eq-1', status: 'pending_review', requiredPeriod: period, assignedTechnicalStaffName: 'Seed Technical Staff', replacesId: null,
  items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 5, technicalRequirements: null }],
  createdAt: '2026-10-17T00:00:00.000Z', actions: ['approve', 'reject'],
}
const projector = { equipmentTypeId: 'projector', equipmentTypeName: 'Projector', requestedQuantity: 5, technicalRequirements: null }
const short = { equipmentRequestId: 'eq-1', requiredPeriod: period, fulfillable: false, items: [{ ...projector, availableQuantity: 3, shortfall: 2, sufficient: false }] }
const enough = { ...short, fulfillable: true, items: [{ ...projector, availableQuantity: 6, shortfall: 0, sufficient: true }] }
const rejected = {
  ...pending, status: 'rejected', actions: [], rejectedByName: 'Seed Technical Staff', rejectedAt: '2026-10-18T02:00:00.000Z',
  rejectionReason: 'Only 3 projectors are available.', suggestedAlternative: 'Three projectors and the LED wall',
}

function show({ roles = [TECHNICAL_STAFF], requests = [pending], availability = short, canSubmit = false, path = '/requests/event?tab=equipment-required' } = {}) {
  api.getRequest.mockResolvedValue({ request: { id: 'event', status: PLANNING, core: { title: 'Partner summit' }, equipment: { requirements: [] } }, editableSections: [], availableActions: [] })
  api.listEquipmentRequests.mockResolvedValue({ canSubmit, requests })
  api.checkEquipmentAvailability.mockResolvedValue({ availability })
  api.listEquipment.mockResolvedValue({ equipment: [{ id: 'projector', name: 'Projector', availableUnits: 3 }] })
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function card() {
  return (await screen.findByRole('heading', { name: 'Equipment requests' })).closest('.equipment-requests')
}

describe('SPM-36 Reject on the Equipment requests card', () => {
  it('spm36_page_a_shortfall_prefills_the_reason_which_can_be_edited_and_sent', async () => {
    const actor = show()
    const section = await card()
    await within(section).findByText(/short by 2/)
    expect(within(section).getByRole('button', { name: 'Approve request' }).disabled).toBe(true)

    await actor.click(within(section).getByRole('button', { name: 'Reject request' }))
    const reason = within(section).getByLabelText('Reason for rejection (required)')
    expect(reason.value).toBe('Not enough available units: Projector (5 requested, 3 available).')
    await actor.type(reason, ' Try next week.')
    await actor.type(within(section).getByLabelText('Suggested alternative (optional)'), 'Three projectors')

    api.decideEquipmentRequest.mockResolvedValue({ equipmentRequest: rejected })
    api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests: [rejected] })
    await actor.click(within(section).getByRole('button', { name: 'Confirm rejection' }))

    expect(await within(section).findByText('Rejected. The Coordinator has been notified.')).toBeTruthy()
    expect(api.decideEquipmentRequest).toHaveBeenCalledWith(user, 'event', 'eq-1', 'reject', {
      reason: 'Not enough available units: Projector (5 requested, 3 available). Try next week.',
      suggestedAlternative: 'Three projectors',
    })
    await waitFor(() => expect(api.getRequest).toHaveBeenCalledTimes(2))
  })

  it('spm36_page_reason_is_required_and_cancel_sends_nothing', async () => {
    const actor = show({ availability: enough })
    const section = await card()
    await within(section).findByText(/6 available, 5 requested/)
    await actor.click(within(section).getByRole('button', { name: 'Reject request' }))
    // A fulfillable request has no shortfall to prefill.
    expect(within(section).getByLabelText('Reason for rejection (required)').value).toBe('')
    expect(within(section).getByText('Enter a reason to continue.')).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Confirm rejection' }).disabled).toBe(true)
    await actor.click(within(section).getByRole('button', { name: 'Cancel' }))
    expect(within(section).queryByLabelText('Reason for rejection (required)')).toBeNull()
    expect(api.decideEquipmentRequest).not.toHaveBeenCalled()
  })

  it('spm36_page_a_server_400_shows_field_errors_and_keeps_the_typed_values', async () => {
    const actor = show({ availability: enough })
    const section = await card()
    await within(section).findByText(/6 available, 5 requested/)
    await actor.click(within(section).getByRole('button', { name: 'Reject request' }))
    await actor.type(within(section).getByLabelText('Reason for rejection (required)'), 'Not suitable')
    await actor.type(within(section).getByLabelText('Suggested alternative (optional)'), 'Something else')
    api.decideEquipmentRequest.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 400, details: { message: 'Validation failed', errors: { suggestedAlternative: 'Must be 1000 characters or fewer.' } },
    }))
    await actor.click(within(section).getByRole('button', { name: 'Confirm rejection' }))

    expect(await within(section).findByText('Must be 1000 characters or fewer.')).toBeTruthy()
    expect(within(section).getByLabelText('Suggested alternative (optional)').getAttribute('aria-invalid')).toBe('true')
    expect(within(section).getByLabelText('Reason for rejection (required)').value).toBe('Not suitable')
    expect(within(section).getByLabelText('Suggested alternative (optional)').value).toBe('Something else')
  })

  it('spm36_page_the_coordinator_sees_the_reason_and_alternative_and_can_submit_a_revision', async () => {
    show({ roles: [COORDINATOR], requests: [rejected], canSubmit: true })
    const section = await card()
    expect(within(section).getByText('Rejected')).toBeTruthy()
    expect(within(section).getByText(/^Seed Technical Staff, /)).toBeTruthy()
    expect(within(section).getByText('Only 3 projectors are available.')).toBeTruthy()
    expect(within(section).getByText('Three projectors and the LED wall')).toBeTruthy()
    expect(within(section).getByRole('heading', { name: 'Submit a revised request' })).toBeTruthy()
    expect(within(section).getByText('This replaces the rejected request.')).toBeTruthy()
    expect(await within(section).findByRole('button', { name: 'Submit equipment request' })).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Reject request' })).toBeNull()
  })
})

describe('SPM-36 Technical Support queue groups', () => {
  it('spm36_page_rejected_requests_move_to_reviewed', async () => {
    api.listAssignedEquipmentRequests.mockResolvedValue({ requests: [
      { id: 'eq-2', eventRequestId: 'event-b', eventTitle: 'Launch', status: 'pending_review', requiredPeriod: period, items: [{ equipmentTypeName: 'Projector', quantity: 1 }], createdAt: '2026-10-02T00:00:00.000Z' },
      { id: 'eq-1', eventRequestId: 'event-a', eventTitle: 'Partner summit', status: 'rejected', requiredPeriod: period, items: [{ equipmentTypeName: 'Projector', quantity: 5 }], createdAt: '2026-10-01T00:00:00.000Z', rejectedAt: '2026-10-03T00:00:00.000Z' },
    ] })
    show({ path: '/equipment/requests' })
    const waiting = await screen.findByRole('region', { name: 'Waiting for review' })
    const reviewed = screen.getByRole('region', { name: 'Reviewed' })
    expect(within(waiting).getByRole('heading', { name: 'Launch' })).toBeTruthy()
    expect(within(reviewed).getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(within(reviewed).getByText('Rejected')).toBeTruthy()
    expect(within(reviewed).getByText('Rejected on')).toBeTruthy()
  })
})
