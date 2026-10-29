// SPM-69, presentation side: the Lead's Requests list, Reassign offered to the Lead and not to the assigned
// Coordinator, and the Lead taken to their list when the event finished meanwhile. The API is mocked; the picker
// itself is covered by tests/spm-26/integration/reassignCoordinatorPage.test.jsx and enforcement by the API suite.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import RequestsPage from '../../../frontend/src/pages/RequestsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), listRequests: vi.fn(), getReassignmentCandidates: vi.fn(), reassignCoordinator: vi.fn() }
})

const { getRequest, listRequests, getReassignmentCandidates, reassignCoordinator } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const LEAD = { user: { uid: 'seed-coordinator-lead' }, userProfile: { name: 'Seed Coordinator Lead' }, roles: ['coordinator_lead'], loading: false }
const COORDINATOR = { user: { uid: 'seed-coordinator' }, userProfile: { name: 'Seed Coordinator' }, roles: ['coordinator'], loading: false }

function response(canReassignCoordinator, assignedCoordinator) {
  return {
    request: { id: 'req-1', status: 'planning', core: { title: 'Partner summit' } },
    editableSections: [],
    availableActions: [],
    canReassignCoordinator,
    assignedCoordinator,
  }
}

function show(auth, path = '/requests/req-1') {
  listRequests.mockResolvedValue({ requests: [{ id: 'req-1', status: 'planning', core: { title: 'Partner summit' } }] })
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-69 — finding and opening an event as the Lead', () => {
  it('spm69_the_leads_list_is_headed_for_the_requests_and_events_they_oversee', async () => {
    show(LEAD, '/requests')
    expect(await screen.findByRole('heading', { level: 1, name: 'Requests you oversee' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
  })

  it('spm69_the_lead_sees_the_current_coordinator_and_reassign', async () => {
    getRequest.mockResolvedValue(response(true, { assigned: true, name: 'Seed Coordinator' }))
    show(LEAD)
    expect(await screen.findByRole('button', { name: 'Reassign coordinator' })).toBeTruthy()
    expect(screen.getByLabelText('Event Coordinator').textContent).toBe('Seed Coordinator')
  })
})

describe('SPM-69 AC3 — the assigned Coordinator is not offered Reassign', () => {
  it('spm69_no_reassign_for_the_assigned_coordinator', async () => {
    getRequest.mockResolvedValue(response(false, null))
    show(COORDINATOR)
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reassign coordinator' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Reassign Coordinator' })).toBeNull()
  })
})

describe('SPM-69 AC2 — an event finished meanwhile', () => {
  it('spm69_a_409_on_an_event_the_lead_can_no_longer_open_takes_them_to_their_list_with_the_reason', async () => {
    getRequest.mockResolvedValue(response(true, { assigned: true, name: 'Seed Coordinator' }))
    getReassignmentCandidates.mockResolvedValue({
      coordinators: [{ uid: 'seed-coordinator-2', name: 'Seed Coordinator 2', activeEvents: 2 }],
      currentCoordinator: { uid: 'seed-coordinator', name: 'Seed Coordinator' },
    })
    reassignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 409,
      details: { message: 'Completed, cancelled and rejected events cannot be reassigned.', reason: 'terminal_status' },
    }))
    const user = show(LEAD)
    await user.click(await screen.findByRole('button', { name: 'Reassign coordinator' }))
    const group = screen.getByRole('group', { name: 'Reassign coordinator' })
    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-2')
    getRequest.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 403, details: { message: 'Forbidden' } }))
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect((await screen.findByRole('status')).textContent).toBe('Completed, cancelled and rejected events cannot be reassigned.')
    expect(await screen.findByRole('heading', { level: 1, name: 'Requests you oversee' })).toBeTruthy()
  })
})
