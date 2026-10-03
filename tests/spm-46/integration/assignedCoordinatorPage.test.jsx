// SPM-46, presentation side: the request detail page shows the assigned Coordinator exactly as the API
// summarises it. The API is mocked here; who receives the name is covered by assignedCoordinatorApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { NAME_UNAVAILABLE, NOT_YET_ASSIGNED } from '../../../frontend/src/components/AssignedCoordinator.jsx'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, updateRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function organiserResponse(assignedCoordinator, overrides = {}) {
  return {
    request: {
      id: 'req-1',
      status: 'submitted',
      core: { title: 'Partner summit', purpose: 'Partners', description: null, preferredDateTime: null, durationHours: 4, expectedAttendees: 80 },
      ...overrides,
    },
    editableSections: [],
    availableActions: [],
    assignedCoordinator,
  }
}

function showRequest(response, roles = ['organiser']) {
  getRequest.mockResolvedValue(response)
  const view = render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Organiser' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/event-requests/:id/edit" element={<p>Draft editor</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { user: userEvent.setup(), view }
}

const coordinatorValue = () => screen.getByText('Event Coordinator').nextElementSibling

describe('SPM-46 — the Organiser sees the assigned Coordinator', () => {
  it('Test 1: shows the Coordinator name', async () => {
    showRequest(organiserResponse({ assigned: true, name: 'Seed Coordinator' }))
    expect(await screen.findByText('Seed Coordinator')).toBeTruthy()
    expect(coordinatorValue().textContent).toBe('Seed Coordinator')
  })

  it('Test 3: shows the new name when the event is next viewed after reassignment', async () => {
    const first = showRequest(organiserResponse({ assigned: true, name: 'Seed Coordinator' }))
    expect(await screen.findByText('Seed Coordinator')).toBeTruthy()
    first.view.unmount()

    showRequest(organiserResponse({ assigned: true, name: 'Seed Coordinator 2' }))
    expect(await screen.findByText('Seed Coordinator 2')).toBeTruthy()
    expect(screen.queryByText('Seed Coordinator')).toBeNull()
  })

  it('Test 4: a submitted event with no Coordinator says "Not yet assigned"', async () => {
    showRequest(organiserResponse({ assigned: false, name: null }))
    expect(await screen.findByText(NOT_YET_ASSIGNED)).toBeTruthy()
    expect(coordinatorValue().textContent).toBe('Not yet assigned')
  })

  it('an assigned Coordinator without a usable name says "Assigned (name unavailable)", not "Not yet assigned"', async () => {
    showRequest(organiserResponse({ assigned: true, name: null }))
    expect(await screen.findByText(NAME_UNAVAILABLE)).toBeTruthy()
    expect(screen.queryByText(NOT_YET_ASSIGNED)).toBeNull()
  })

  it('Test 5: a draft opens in the draft editor and shows no Coordinator', async () => {
    showRequest(organiserResponse(null, { status: 'draft' }))
    expect(await screen.findByText('Draft editor')).toBeTruthy()
    expect(screen.queryByText('Event Coordinator')).toBeNull()
    expect(screen.queryByText(NOT_YET_ASSIGNED)).toBeNull()
  })

  it('a role the API sends no Coordinator to sees no Coordinator row', async () => {
    showRequest({ ...organiserResponse(null), assignedCoordinator: null }, ['venue_staff'])
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByText('Event Coordinator')).toBeNull()
  })

  it('a response without the field (older API) shows no Coordinator row', async () => {
    const { assignedCoordinator: _omitted, ...response } = organiserResponse(null)
    showRequest(response)
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByText('Event Coordinator')).toBeNull()
  })

  it('the name stays on the page after a save', async () => {
    const response = { ...organiserResponse({ assigned: true, name: 'Seed Coordinator' }, { status: 'returned_for_clarification' }), editableSections: ['core'] }
    const { user } = showRequest(response)
    const title = await screen.findByLabelText('Title')
    updateRequest.mockResolvedValue({
      ...response,
      request: { ...response.request, core: { ...response.request.core, title: 'Partner summit 2' } },
    })
    await user.clear(title)
    await user.type(title, 'Partner summit 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    expect(coordinatorValue().textContent).toBe('Seed Coordinator')
  })
})
