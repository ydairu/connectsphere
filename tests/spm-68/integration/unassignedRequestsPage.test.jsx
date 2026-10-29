// SPM-68, presentation side: the Lead's Unassigned requests page lists the queue, offers a Coordinator picker
// with each Coordinator's active events (nothing pre-selected) and confirms the assignment. The API is mocked
// here; enforcement is covered by assignCoordinatorApi.test.js and unassignedQueueApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import UnassignedRequestsPage from '../../../frontend/src/pages/UnassignedRequestsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listUnassignedRequests: vi.fn(),
    getAssignmentCandidates: vi.fn(),
    assignCoordinator: vi.fn(),
  }
})

const { listUnassignedRequests, getAssignmentCandidates, assignCoordinator } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const FORUM = {
  id: 'req-forum',
  title: 'Partner forum',
  preferredDateTime: '2026-12-10T06:00:00.000Z',
  durationHours: 3,
  expectedAttendees: 40,
  organisationName: 'Seed Organisation A',
  submittedAt: '2026-10-28T01:30:00.000Z',
}
const GALA = { ...FORUM, id: 'req-gala', title: 'Winter gala', organisationName: 'Seed Organisation B' }
const CANDIDATES = [
  { uid: 'seed-coordinator', name: 'Seed Coordinator', activeEvents: 6 },
  { uid: 'seed-coordinator-3', name: 'Seed Coordinator 3', activeEvents: 1 },
]

function showPage(requests = [FORUM, GALA]) {
  listUnassignedRequests.mockResolvedValue({ requests })
  getAssignmentCandidates.mockResolvedValue({ candidates: CANDIDATES })
  render(
    <AuthContext.Provider value={{ user: { uid: 'seed-coordinator-lead' }, userProfile: { name: 'Seed Coordinator Lead' }, roles: ['coordinator_lead'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/unassigned']}>
        <UnassignedRequestsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const card = async (title) => (await screen.findByRole('heading', { name: title })).closest('.booking-card')

async function openPicker(user, title) {
  const row = await card(title)
  await user.click(within(row).getByRole('button', { name: 'Assign' }))
  return screen.findByRole('group', { name: `Assign a Coordinator to ${title}` })
}

describe('SPM-68 AC3 — the queue page', () => {
  it('lists each unassigned request with its basic event information', async () => {
    showPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Unassigned requests' })).toBeTruthy()
    const row = await card('Partner forum')
    const text = row.textContent
    expect(text).toContain('Date and time')
    expect(text).toContain('3 hours')
    expect(text).toContain('Expected attendees40')
    expect(text).toContain('OrganisationSeed Organisation A')
    expect(text).toContain('Submitted')
    expect(within(row).getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/requests/req-forum')
    expect(await card('Winter gala')).toBeTruthy()
  })

  it('says so when nothing is waiting', async () => {
    showPage([])
    expect(await screen.findByText('No requests are waiting for a Coordinator.')).toBeTruthy()
  })

  it('shows the API’s refusal when the list cannot be loaded', async () => {
    listUnassignedRequests.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 403, details: { message: 'Only an Event Coordinator Lead can assign Coordinators.' } }))
    render(
      <AuthContext.Provider value={{ user: { uid: 'x' }, roles: ['organiser'], loading: false }}>
        <MemoryRouter><UnassignedRequestsPage /></MemoryRouter>
      </AuthContext.Provider>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Only an Event Coordinator Lead can assign Coordinators.')
  })
})

describe('SPM-68 AC4 — choose a Coordinator, then confirm', () => {
  it('the picker shows each Coordinator’s active events with nothing pre-selected, and Confirm waits for a choice', async () => {
    const user = showPage()
    const group = await openPicker(user, 'Partner forum')

    expect(getAssignmentCandidates).toHaveBeenCalledWith(expect.anything(), 'req-forum')
    const select = await within(group).findByLabelText('Event Coordinator')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Choose a Coordinator',
      'Seed Coordinator · 6 active events',
      'Seed Coordinator 3 · 1 active event',
    ])
    expect(select.value).toBe('')
    expect(within(group).getByRole('button', { name: 'Confirm assignment' }).disabled).toBe(true)
  })

  it('confirming assigns the chosen Coordinator, removes the row and says who has it', async () => {
    assignCoordinator.mockResolvedValue({ id: 'req-forum', assigned: true, coordinator: { name: 'Seed Coordinator 3' } })
    const user = showPage()
    const group = await openPicker(user, 'Partner forum')

    await user.selectOptions(await within(group).findByLabelText('Event Coordinator'), 'seed-coordinator-3')
    await user.click(within(group).getByRole('button', { name: 'Confirm assignment' }))

    expect(assignCoordinator).toHaveBeenCalledWith(expect.anything(), 'req-forum', { coordinatorUid: 'seed-coordinator-3' })
    expect((await screen.findByRole('status')).textContent).toBe('“Partner forum” was assigned to Seed Coordinator 3.')
    expect(screen.queryByRole('heading', { name: 'Partner forum' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Winter gala' })).toBeTruthy()
  })

  it('cancel closes the picker without assigning', async () => {
    const user = showPage()
    const group = await openPicker(user, 'Partner forum')
    await user.click(within(group).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(assignCoordinator).not.toHaveBeenCalled()
  })

  it('already assigned by another Lead (409): explains and refreshes the list', async () => {
    assignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 409, details: { message: 'This request is no longer waiting for a Coordinator.', reason: 'not_unassigned' } }))
    const user = showPage()
    const group = await openPicker(user, 'Partner forum')
    listUnassignedRequests.mockResolvedValue({ requests: [GALA] })

    await user.selectOptions(await within(group).findByLabelText('Event Coordinator'), 'seed-coordinator')
    await user.click(within(group).getByRole('button', { name: 'Confirm assignment' }))

    expect((await screen.findByRole('status')).textContent).toContain('This request is no longer waiting for a Coordinator. The list has been refreshed.')
    expect(listUnassignedRequests).toHaveBeenCalledTimes(2)
    await screen.findByRole('heading', { name: 'Winter gala' })
    expect(screen.queryByRole('heading', { name: 'Partner forum' })).toBeNull()
  })

  it('an invalid choice (400) is shown in the picker and the row stays', async () => {
    assignCoordinator.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 400, details: { message: 'You cannot assign an event to yourself.', reason: 'target_is_self' } }))
    const user = showPage()
    const group = await openPicker(user, 'Partner forum')

    await user.selectOptions(await within(group).findByLabelText('Event Coordinator'), 'seed-coordinator')
    await user.click(within(group).getByRole('button', { name: 'Confirm assignment' }))

    expect((await within(group).findByRole('alert')).textContent).toBe('You cannot assign an event to yourself.')
    expect(screen.getByRole('heading', { name: 'Partner forum' })).toBeTruthy()
  })

  it('says so when no Coordinator can be chosen', async () => {
    const user = showPage()
    getAssignmentCandidates.mockResolvedValue({ candidates: [] })
    const group = await openPicker(user, 'Partner forum')
    expect(await within(group).findByText('No Event Coordinator is available for this request.')).toBeTruthy()
    expect(within(group).queryByRole('button', { name: 'Confirm assignment' })).toBeNull()
  })
})
