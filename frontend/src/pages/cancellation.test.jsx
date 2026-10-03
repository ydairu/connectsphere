// SPM-63 and SPM-47, presentation side: the request page and the requests list. The API is mocked; the
// rules and notifications are covered in tests/spm-63 and tests/spm-47.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import RequestDetailPage from './RequestDetailPage.jsx'
import RequestsPage from './RequestsPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), listRequests: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, listRequests, transitionRequest } = await import('../services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const confirmed = { id: 'req-1', status: 'confirmed', core: { title: 'A1 confirmed' } }

function renderAt(path, roles) {
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Tester' }, roles, loading: false }}>
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

function showRequest(response, roles) {
  getRequest.mockResolvedValue(response)
  return renderAt('/requests/req-1', roles)
}

const dialogSend = () => screen.getByRole('group', { name: 'Confirm status change' }).querySelectorAll('button')[1]

describe('SPM-63 — the Coordinator cancels a Confirmed event', () => {
  it('spm63_submitting_without_a_reason_is_blocked_and_a_message_asks_for_one', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['cancel'] }, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Cancel event' }))
    expect(dialogSend().disabled).toBe(true)
    expect(screen.getByText('Enter a reason to continue.')).toBeTruthy()
    await user.type(screen.getByLabelText('Reason (required)'), 'Venue closed')
    expect(screen.queryByText('Enter a reason to continue.')).toBeNull()
    expect(dialogSend().disabled).toBe(false)
  })

  it('spm63_cancel_event_is_not_offered_before_confirmation_and_reject_is_shown_instead', async () => {
    showRequest({ request: { ...confirmed, status: 'planning' }, editableSections: [], availableActions: ['reject'] }, ['coordinator'])
    expect(await screen.findByRole('button', { name: 'Reject request' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel event' })).toBeNull()
  })

  it('spm63_a_cancelled_event_is_labelled_cancelled_and_shows_the_reason_and_no_actions', async () => {
    showRequest(
      {
        request: { ...confirmed, status: 'cancelled' },
        editableSections: [],
        availableActions: [],
        cancellation: { reason: 'Venue closed for repairs', cancelledAt: '2026-11-01T02:00:00.000Z', requestedByOrganiser: false },
      },
      ['organiser'],
    )
    expect(await screen.findByText('Cancelled', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Event cancelled' })).toBeTruthy()
    expect(screen.getByText('Venue closed for repairs')).toBeTruthy()
    expect(screen.queryByText('Cancelled at the organiser’s request.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Status actions' })).toBeNull()
  })

  it('spm63_a_cancellation_from_an_organiser_request_says_so', async () => {
    showRequest(
      {
        request: { ...confirmed, status: 'cancelled' },
        editableSections: [],
        availableActions: [],
        cancellation: { reason: 'Keynote withdrew', cancelledAt: null, requestedByOrganiser: true },
      },
      ['venue_staff'],
    )
    expect(await screen.findByText('Cancelled at the organiser’s request.')).toBeTruthy()
    expect(screen.getByText('Keynote withdrew')).toBeTruthy()
  })
})

describe('SPM-63 — a Cancelled event is not in the active events list', () => {
  const list = [
    confirmed,
    { id: 'req-cancelled', status: 'cancelled', core: { title: 'A1 cancelled' } },
    { id: 'req-completed', status: 'completed', core: { title: 'A1 completed' } },
    { id: 'req-rejected', status: 'rejected', core: { title: 'A1 rejected' } },
  ]

  it('spm63_cancelled_completed_and_rejected_events_are_listed_under_closed_events', async () => {
    listRequests.mockResolvedValue({ requests: list })
    renderAt('/requests', ['organiser'])
    const closed = await screen.findByRole('region', { name: 'Closed events' })
    const active = screen.getAllByRole('list').find((element) => !closed.contains(element))

    for (const title of ['A1 cancelled', 'A1 completed', 'A1 rejected']) {
      expect(closed.textContent).toContain(title)
      expect(active.textContent).not.toContain(title)
    }
    expect(active.textContent).toContain('A1 confirmed')
    expect(closed.textContent).toContain('Cancelled')
  })

  it('spm63_with_no_closed_events_there_is_no_closed_section', async () => {
    listRequests.mockResolvedValue({ requests: [confirmed] })
    renderAt('/requests', ['organiser'])
    await screen.findByText('A1 confirmed')
    expect(screen.queryByRole('region', { name: 'Closed events' })).toBeNull()
  })
})

describe('SPM-47 — the Organiser’s cancellation request', () => {
  it('spm47_requesting_without_a_reason_is_blocked_and_a_message_asks_for_one', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['request_cancellation'] }, ['organiser'])
    await user.click(await screen.findByRole('button', { name: 'Request cancellation' }))
    expect(dialogSend().disabled).toBe(true)
    expect(screen.getByText('Enter a reason to continue.')).toBeTruthy()
    expect(transitionRequest).not.toHaveBeenCalled()
  })

  it('spm47_with_a_request_open_the_owner_sees_its_status_and_no_request_button', async () => {
    showRequest(
      { request: confirmed, editableSections: [], availableActions: [], cancellationRequest: { status: 'pending', reason: 'Budget cut' } },
      ['organiser'],
    )
    expect(await screen.findByText(/awaiting the event coordinator/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Request cancellation' })).toBeNull()
  })

  it('spm47_a_returned_request_shows_the_coordinators_message_and_can_be_resubmitted_with_an_updated_reason', async () => {
    const user = showRequest(
      {
        request: confirmed,
        editableSections: [],
        availableActions: ['resubmit_cancellation'],
        cancellationRequest: { status: 'returned', reason: 'Keynote withdrew', returnMessage: 'Which sessions are affected?' },
      },
      ['organiser'],
    )
    expect(await screen.findByText(/needs more information/)).toBeTruthy()
    expect(screen.getByText('Which sessions are affected?')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Resubmit cancellation request' }))
    await user.type(screen.getByLabelText('Updated reason (required)'), 'All afternoon sessions')
    transitionRequest.mockResolvedValue({
      request: confirmed,
      editableSections: [],
      availableActions: [],
      cancellationRequest: { status: 'pending', reason: 'All afternoon sessions' },
    })
    await user.click(dialogSend())
    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'resubmit_cancellation', 'All afternoon sessions')
    expect(await screen.findByText(/awaiting the event coordinator/)).toBeTruthy()
  })

  it('spm47_the_coordinator_can_return_a_pending_request_with_a_message', async () => {
    const user = showRequest(
      {
        request: confirmed,
        editableSections: [],
        availableActions: ['approve_cancellation', 'refuse_cancellation', 'return_cancellation'],
        cancellationRequest: { status: 'pending', reason: 'Budget cut' },
      },
      ['coordinator'],
    )
    await user.click(await screen.findByRole('button', { name: 'Return cancellation request' }))
    expect(screen.getByText('Enter a message to the organiser to continue.')).toBeTruthy()
    await user.type(screen.getByLabelText('Message to the organiser (required)'), 'Which sessions?')
    transitionRequest.mockResolvedValue({
      request: confirmed,
      editableSections: [],
      availableActions: ['refuse_cancellation'],
      cancellationRequest: { status: 'returned', reason: 'Budget cut', returnMessage: 'Which sessions?' },
    })
    await user.click(dialogSend())
    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'return_cancellation', 'Which sessions?')
    expect(await screen.findByText('Your decision has been recorded.')).toBeTruthy()
  })

  it('spm47_refusing_needs_a_reason', async () => {
    const user = showRequest(
      {
        request: confirmed,
        editableSections: [],
        availableActions: ['approve_cancellation', 'refuse_cancellation'],
        cancellationRequest: { status: 'pending', reason: 'Budget cut' },
      },
      ['coordinator'],
    )
    await user.click(await screen.findByRole('button', { name: 'Refuse cancellation' }))
    expect(screen.getByLabelText('Reason (required)')).toBeTruthy()
    expect(dialogSend().disabled).toBe(true)
  })

  it('spm47_after_the_start_the_coordinator_is_told_why_approve_is_missing', async () => {
    showRequest(
      {
        request: confirmed,
        editableSections: [],
        availableActions: ['refuse_cancellation'],
        cancellationRequest: { status: 'pending', reason: 'Budget cut' },
      },
      ['coordinator'],
    )
    expect(await screen.findByText(/start date\/time has passed, so this cancellation request can no longer be approved/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve cancellation' })).toBeNull()
  })
})
