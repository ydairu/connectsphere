// SPM-26, presentation side, as SPM-69 changed it: the request page offers Reassign only when the API says so
// (now to the Event Coordinator Lead), lists Coordinators with their active events, needs only a choice (the
// offline-agreement checkbox is gone) and, after success, stays on the event and names the new Coordinator. The
// API is mocked here; enforcement is covered by reassignCoordinatorApi.test.js.

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
  { uid: 'seed-coordinator-2', name: 'Seed Coordinator 2', activeEvents: 2 },
  { uid: 'seed-coordinator-3', name: 'Seed Coordinator 3', activeEvents: 1 },
]
const CURRENT = { uid: 'seed-coordinator', name: 'Seed Coordinator' }

function leadResponse(canReassignCoordinator = true, coordinatorName = 'Seed Coordinator') {
  return {
    request: { id: 'req-1', status: 'submitted', core: { title: 'Partner summit' }, organisationName: 'Seed Organisation A' },
    editableSections: [],
    availableActions: [],
    canReassignCoordinator,
    assignedCoordinator: { assigned: true, name: coordinatorName },
  }
}

function showRequest(response) {
  getRequest.mockResolvedValue(response)
  listRequests.mockResolvedValue({ requests: [] })
  render(
    <AuthContext.Provider value={{ user: { uid: 'seed-coordinator-lead' }, userProfile: { name: 'Seed Coordinator Lead' }, roles: ['coordinator_lead'], loading: false }}>
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
    showRequest(leadResponse(false))
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reassign coordinator' })).toBeNull()
  })

  it('AC3: lists the Coordinators the API returns, with their active events, and names the current one', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    const select = await within(group).findByLabelText('New Event Coordinator')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Choose a Coordinator',
      'Seed Coordinator 2 · 2 active events',
      'Seed Coordinator 3 · 1 active event',
    ])
    expect(select.value).toBe('')
    expect(group.textContent).toContain('It is currently assigned to Seed Coordinator.')
    expect(getReassignmentCandidates).toHaveBeenCalledWith(expect.anything(), 'req-1')
  })

  it('SPM-69: Confirm needs only a Coordinator — there is no agreement checkbox', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    const confirm = await within(group).findByRole('button', { name: 'Reassign event' })
    expect(confirm.disabled).toBe(true)
    expect(within(group).queryByRole('checkbox')).toBeNull()

    await user.selectOptions(within(group).getByLabelText('New Event Coordinator'), 'seed-coordinator-2')
    expect(confirm.disabled).toBe(false)
    await user.selectOptions(within(group).getByLabelText('New Event Coordinator'), '')
    expect(confirm.disabled).toBe(true)
  })

  it('on success, sends the choice with the current Coordinator, stays on the event and names the new one', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    reassignCoordinator.mockResolvedValue({ reassigned: true, coordinator: { name: 'Seed Coordinator 2' } })
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    getRequest.mockResolvedValue(leadResponse(true, 'Seed Coordinator 2'))

    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-2')
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect(reassignCoordinator).toHaveBeenCalledWith(expect.anything(), 'req-1', { coordinatorUid: 'seed-coordinator-2', expectedCoordinatorUid: 'seed-coordinator' })
    expect(await screen.findByText('Event reassigned to Seed Coordinator 2.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(getRequest).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Event Coordinator').textContent).toBe('Seed Coordinator 2')
    expect(screen.queryByRole('group', { name: 'Reassign coordinator' })).toBeNull()
  })

  it('SPM-69: a 409 (the Coordinator changed meanwhile) reloads the event and says so', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    reassignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 409,
      details: { message: 'This event’s Coordinator has changed since you opened it.', reason: 'coordinator_changed' },
    }))
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-3')
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect(await screen.findByText('This event’s Coordinator has changed since you opened it. The page has been refreshed.')).toBeTruthy()
    expect(getRequest).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
  })

  it('a 400 refusal shows the server message in the form and stays on the page', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    reassignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', {
      status: 400,
      details: { message: 'The chosen user is not an Event Coordinator.', reason: 'target_not_coordinator' },
    }))
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    await user.selectOptions(await within(group).findByLabelText('New Event Coordinator'), 'seed-coordinator-3')
    await user.click(within(group).getByRole('button', { name: 'Reassign event' }))

    expect((await within(group).findByRole('alert')).textContent).toBe('The chosen user is not an Event Coordinator.')
    expect(screen.getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
  })

  it('says so when no other Coordinator is available', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: [], currentCoordinator: CURRENT })
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    expect(await within(group).findByText('No other Event Coordinator is available to take this event.')).toBeTruthy()
    expect(within(group).queryByRole('button', { name: 'Reassign event' })).toBeNull()
  })

  it('Go back closes the form without reassigning', async () => {
    getReassignmentCandidates.mockResolvedValue({ coordinators: CANDIDATES, currentCoordinator: CURRENT })
    const user = showRequest(leadResponse())
    const group = await openReassign(user)
    await user.click(within(group).getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('group', { name: 'Reassign coordinator' })).toBeNull()
    expect(reassignCoordinator).not.toHaveBeenCalled()
  })
})
