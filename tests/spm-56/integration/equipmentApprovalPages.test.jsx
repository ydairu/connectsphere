// SPM-56, presentation side: the Technical Support queue page and the Approve action on the event page's
// Equipment requests card. The API is mocked here; rules and enforcement are covered by the unit, service and
// API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { COORDINATOR, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
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
  items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, technicalRequirements: null }],
  createdAt: '2026-10-17T00:00:00.000Z', actions: ['approve'],
}
const fulfillable = { equipmentRequestId: 'eq-1', requiredPeriod: period, fulfillable: true, items: [{ equipmentTypeId: 'projector', equipmentTypeName: 'Projector', requestedQuantity: 2, availableQuantity: 3, shortfall: 0, sufficient: true }] }
const short = { ...fulfillable, fulfillable: false, items: [{ ...fulfillable.items[0], requestedQuantity: 4, shortfall: 1, sufficient: false }] }

function show(path, roles) {
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

function eventPage({ roles = [TECHNICAL_STAFF], requests = [pending], availability = fulfillable } = {}) {
  api.getRequest.mockResolvedValue({ request: { id: 'event', status: PLANNING, core: { title: 'Partner summit' } }, editableSections: [], availableActions: [] })
  api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests })
  api.checkEquipmentAvailability.mockResolvedValue({ availability })
  return show('/requests/event?tab=equipment-required', roles)
}

async function card() {
  return (await screen.findByRole('heading', { name: 'Equipment requests' })).closest('.equipment-requests')
}

describe('SPM-56 Technical Support queue page', () => {
  it('spm56_page_queue_lists_my_requests_and_links_each_to_its_event_card', async () => {
    api.listAssignedEquipmentRequests.mockResolvedValue({ requests: [
      { id: 'eq-1', eventRequestId: 'event-a', eventTitle: 'Partner summit', status: 'pending_review', requiredPeriod: period, items: [{ equipmentTypeName: 'Projector', quantity: 2 }], createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'eq-2', eventRequestId: 'event-b', eventTitle: 'Launch', status: 'approved', requiredPeriod: period, items: [{ equipmentTypeName: 'PA speaker set', quantity: 1 }], createdAt: '2026-09-01T00:00:00.000Z', approvedAt: '2026-10-02T00:00:00.000Z' },
    ] })
    show('/equipment/requests', [TECHNICAL_STAFF])

    expect(await screen.findByRole('heading', { name: 'Equipment requests', level: 1 })).toBeTruthy()
    // SPM-36 grouped the queue under "Waiting for review" and "Reviewed"; event titles moved to level 3.
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Waiting for review', 'Reviewed'])
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Partner summit', 'Launch'])
    expect(screen.getByText('2 × Projector')).toBeTruthy()
    expect(screen.getByText('Pending Review')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Review on event' }).map((link) => link.getAttribute('href'))).toEqual([
      '/requests/event-a?tab=equipment-required#equipment-requests', '/requests/event-b?tab=equipment-required#equipment-requests',
    ])
  })

  it('spm56_page_queue_empty_state', async () => {
    api.listAssignedEquipmentRequests.mockResolvedValue({ requests: [] })
    show('/equipment/requests', [TECHNICAL_STAFF])
    expect(await screen.findByText('No equipment requests are assigned to you.')).toBeTruthy()
  })

  it('spm56_page_queue_and_link_are_for_technical_staff_only', async () => {
    api.listAssignedEquipmentRequests.mockResolvedValue({ requests: [] })
    show('/equipment/requests', [TECHNICAL_STAFF])
    expect(await screen.findByRole('link', { name: 'Equipment requests' })).toBeTruthy()
    cleanup()
    api.getRequest.mockResolvedValue({ request: { id: 'event', status: PLANNING, core: { title: 'Partner summit' } }, editableSections: [], availableActions: [] })
    api.listEquipmentRequests.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 404 }))
    show('/requests/event', [COORDINATOR, VENUE_STAFF])
    await screen.findByRole('heading', { name: 'Partner summit' })
    expect(screen.queryByRole('link', { name: 'Equipment requests' })).toBeNull()
    expect(api.listAssignedEquipmentRequests).toHaveBeenCalledTimes(1)
  })
})

describe('SPM-56 Approve on the Equipment requests card', () => {
  it('spm56_page_assignee_sees_quantities_and_approves', async () => {
    const actor = eventPage()
    const section = await card()
    expect(await within(section).findByText(/3 available, 2 requested/)).toBeTruthy()
    const approveButton = within(section).getByRole('button', { name: 'Approve request' })
    expect(approveButton.disabled).toBe(false)

    api.decideEquipmentRequest.mockResolvedValue({ equipmentRequest: { ...pending, status: 'approved' }, availability: fulfillable })
    api.listEquipmentRequests.mockResolvedValue({ canSubmit: false, requests: [{ ...pending, status: 'approved', actions: [], approvedByName: 'Seed Technical Staff', approvedAt: '2026-10-17T02:00:00.000Z' }] })
    await actor.click(approveButton)

    expect(await within(section).findByText('Approved. The technical arrangement is approved.')).toBeTruthy()
    expect(api.decideEquipmentRequest).toHaveBeenCalledWith(user, 'event', 'eq-1', 'approve')
    expect(within(section).getByText('Approved')).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Approve request' })).toBeNull()
    // The page reloads the request, so the technical sign-off shown elsewhere is current.
    await waitFor(() => expect(api.getRequest).toHaveBeenCalledTimes(2))
  })

  it('spm56_page_shortfall_is_shown_and_approve_is_disabled', async () => {
    eventPage({ availability: short })
    const section = await card()
    expect(await within(section).findByText('Shortfall: this request cannot be fulfilled.')).toBeTruthy()
    expect(within(section).getByText(/short by 1/)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Approve request' }).disabled).toBe(true)
    expect(within(section).getByText('A request with a shortfall cannot be approved.')).toBeTruthy()
  })

  it('spm56_page_a_server_shortfall_replaces_the_result_and_disables_approve', async () => {
    const actor = eventPage()
    const section = await card()
    await within(section).findByText(/3 available, 2 requested/)
    api.decideEquipmentRequest.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 409,
      details: { message: 'This request cannot be fulfilled: at least one equipment type does not have enough available units.', availability: short },
    }))
    await actor.click(within(section).getByRole('button', { name: 'Approve request' }))

    expect(await within(section).findByRole('alert')).toBeTruthy()
    expect(within(section).getByText(/short by 1/)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Approve request' }).disabled).toBe(true)
  })

  it('spm56_page_no_approve_without_the_action_and_the_coordinator_sees_who_approved', async () => {
    eventPage({ requests: [{ ...pending, actions: [] }] })
    const section = await card()
    expect(within(section).getByRole('button', { name: 'Check availability' })).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Approve request' })).toBeNull()
    expect(api.checkEquipmentAvailability).not.toHaveBeenCalled()
    cleanup()

    eventPage({ roles: [COORDINATOR], requests: [{ ...pending, status: 'approved', actions: [], approvedByName: 'Seed Technical Staff', approvedAt: '2026-10-17T02:00:00.000Z' }] })
    const coordinatorCard = await card()
    expect(within(coordinatorCard).getByText('Approved')).toBeTruthy()
    expect(within(coordinatorCard).getByText(/^Seed Technical Staff, /)).toBeTruthy()
    expect(within(coordinatorCard).queryByRole('button', { name: 'Approve request' })).toBeNull()
  })

  it('spm56_page_reconfirm_is_offered_when_the_api_says_so', async () => {
    const actor = eventPage({ requests: [{ ...pending, status: 'approved', actions: ['reconfirm_approval'] }] })
    const section = await card()
    await within(section).findByText(/3 available, 2 requested/)
    expect(within(section).getByText(/Re-confirm to approve it again/)).toBeTruthy()
    api.decideEquipmentRequest.mockResolvedValue({ equipmentRequest: { ...pending, status: 'approved' }, availability: fulfillable })
    await actor.click(within(section).getByRole('button', { name: 'Re-confirm approval' }))
    await waitFor(() => expect(api.decideEquipmentRequest).toHaveBeenCalledWith(user, 'event', 'eq-1', 'reconfirm_approval'))
  })
})
