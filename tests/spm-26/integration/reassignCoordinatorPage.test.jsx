// SPM-26, presentation side: the request page offers Reassign only when the API says so, requires a
// Coordinator and the offline-agreement checkbox, and takes the former Coordinator to their list after
// success. The API is mocked here; enforcement is covered by reassignCoordinatorApi.test.js.

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
  return {
    ...actual,
    getRequest: vi.fn(),
    listRequests: vi.fn(),
    getReassignmentCandidates: vi.fn(),
    reassignCoordinator: vi.fn(),
  }
})

const { getRequest, listRequests, getReassignmentCandidates, reassignCoordinator } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CANDIDATES = [
  { uid: 'seed-coordinator-2', name: 'Seed Coordinator 2' },
  { uid: 'seed-coordinator-3', name: 'Seed Coordinator 3' },
]

function coordinatorResponse(canReassignCoordinator = true) {
  return {
    request: { id: 'req-1', status: 'submitted', core: { title: 'Partner summit' } },
    editableSections: [],
    availableActions: [],
    canReassignCoordinator,
  }
}

function showRequest(response) {
  getRequest.mockResolvedValue(response)
  listRequests.mockResolvedValue({ requests: [] })
  render(
    <AuthContext.Provider value={{ user: { uid: 'seed-coordinator' }, userProfile: { name: 'Seed Coordinator' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function openReassign(user) {
  await user.click(await screen.findByRole('button', { name: 'Reassign coordinator' }))
  return screen.getByRole('group', { name: 'Reassign coordinator' })
}

describe('SPM-26 — Reassign on the event page', () => {
  it('is offered only when the API allows it', async () => {
    showRequest(coordinatorResponse(false))
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reassign coordinator' })).toBeNull()
  })

  it('AC3: lists the Coordinators the API returns', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES })
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)
    const select = await within(group).findByLabelText('New Event Coordinator')
    expect([...select.options].map((option) => option.textContent)).toEqual(['Choose a Coordinator', 'Seed Coordinator 2', 'Seed Coordinator 3'])
    expect(getReassignmentCandidates).toHaveBeenCalledWith(expect.anything(), 'req-1')
  })

  it('AC2: Confirm needs both a Coordinator and the agreement checkbox', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES })
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)
    const confirm = await within(group).findByRole('button', { name: 'Reassign event' })
    expect(confirm.disabled).toBe(true)

    await user.selectOptions(within(group).getByLabelText('New Event Coordinator'), 'seed-coordinator-2')
    expect(confirm.disabled).toBe(true)
    await user.click(within(group).getByLabelText('The handover was agreed with the new Coordinator outside the system'))
    expect(confirm.disabled).toBe(false)

    await user.selectOptions(within(group).getByLabelText('New Event Coordinator'), '')
    expect(confirm.disabled).toBe(true)
  })

  it('on success, sends the choice and takes the former Coordinator to their list with a notice', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES })
    reassignCoordinator.mockResolvedValue({ reassigned: true, coordinator: { name: 'Seed Coordinator 2' } })
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)

    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-2')
    await user.click(within(group).getByLabelText('The handover was agreed with the new Coordinator outside the system'))
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect(reassignCoordinator).toHaveBeenCalledWith(expect.anything(), 'req-1', { coordinatorUid: 'seed-coordinator-2', handoverAgreed: true })
    expect((await screen.findByRole('status')).textContent).toBe('Event reassigned to Seed Coordinator 2.')
    expect(screen.queryByRole('heading', { name: 'Partner summit' })).toBeNull()
  })

  it('a refusal shows the server message and stays on the page', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES })
    reassignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 409,
      details: { message: 'Completed, cancelled and rejected events cannot be reassigned.', reason: 'terminal_status' },
    }))
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)
    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-3')
    await user.click(within(group).getByLabelText('The handover was agreed with the new Coordinator outside the system'))
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect((await within(group).findByRole('alert')).textContent).toBe('Completed, cancelled and rejected events cannot be reassigned.')
    expect(screen.getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
  })

  it('says so when no other Coordinator is available', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: [] })
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)
    expect(await within(group).findByText('No other Event Coordinator is available to take this event.')).toBeTruthy()
    expect(within(group).queryByRole('button', { name: 'Reassign event' })).toBeNull()
  })

  it('Go back closes the form without reassigning', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES })
    const user = showRequest(coordinatorResponse())
    const group = await openReassign(user)
    await user.click(within(group).getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('group', { name: 'Reassign coordinator' })).toBeNull()
    expect(reassignCoordinator).not.toHaveBeenCalled()
  })
})
