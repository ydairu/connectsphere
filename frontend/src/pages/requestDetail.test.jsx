// SPM-42, presentation side: the detail page renders what the API returns for each role. The API is
// mocked here; the enforcement itself is covered by the API suites in backend/src/routes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import { ApiRequestError } from '../services/api.js'
import RequestDetailPage from './RequestDetailPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, transitionRequest, updateRequest } = await import('../services/api.js')

afterEach(cleanup)

const venueStaffResponse = {
  request: {
    id: 'req-1',
    status: 'planning',
    core: { title: 'A1 planning', purpose: 'Partners', description: null, preferredDateTime: null, durationHours: 4, expectedAttendees: 80 },
    venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: null },
  },
  editableSections: ['venue'],
}

// `response` null means the caller has already set up getRequest's rejection.
function showRequest(response, roles = ['venue_staff']) {
  if (response) getRequest.mockResolvedValue(response)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Tester' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/event-requests/:id/edit" element={<p>Draft editor</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-42 — viewing a request by role', () => {
  it('Venue staff see and edit the venue section, and the equipment section is absent', async () => {
    showRequest(venueStaffResponse)
    expect(await screen.findByText('Venue')).toBeTruthy()
    expect(screen.queryByText('Equipment and technical support')).toBeNull()
    // Their own section is editable; the main details they may view are read-only.
    expect(screen.getByLabelText('Layout preference')).toBeTruthy()
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByText('Event details')).toBeTruthy()
  })

  it('A viewer with no editable section is told they cannot change it', async () => {
    showRequest({ ...venueStaffResponse, editableSections: [] }, ['organiser'])
    expect(await screen.findByText('You can view this request but cannot change it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('A draft opens in the draft editor instead of this page', async () => {
    showRequest({ request: { id: 'req-1', status: 'draft', core: { title: 'Draft' } }, editableSections: ['core'] }, ['organiser'])
    expect(await screen.findByText('Draft editor')).toBeTruthy()
  })

  it('A record the user cannot see reports no access', async () => {
    getRequest.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 403 }))
    showRequest(null)
    expect(await screen.findByText('You do not have access to this request.')).toBeTruthy()
  })
})

describe('SPM-42 #7 — a rejected field is named', () => {
  it('Saving sends only the changed field and reports the fields the API rejected', async () => {
    const user = showRequest(venueStaffResponse)
    const layout = await screen.findByLabelText('Layout preference')
    await user.clear(layout)
    await user.type(layout, 'banquet')

    updateRequest.mockRejectedValueOnce(
      new ApiRequestError('API_REQUEST_FAILED', { status: 403, details: { forbiddenFields: ['venue.layoutPreference'] } }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateRequest).toHaveBeenCalled())
    expect(updateRequest.mock.calls[0][2]).toEqual({ venue: { layoutPreference: 'banquet' } })
    expect(await screen.findByText('You are not allowed to change: venue.layoutPreference')).toBeTruthy()
  })

  it('A successful save reports the change', async () => {
    const user = showRequest(venueStaffResponse)
    const layout = await screen.findByLabelText('Layout preference')
    await user.clear(layout)
    await user.type(layout, 'banquet')

    updateRequest.mockResolvedValueOnce({
      request: { ...venueStaffResponse.request, venue: { ...venueStaffResponse.request.venue, layoutPreference: 'banquet' } },
      editableSections: ['venue'],
    })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Changes saved.')).toBeTruthy()
  })
})

// SPM-9, presentation side: the current status is shown, and the status actions offered are exactly the
// ones the API lists in availableActions. The API is mocked; the rules are covered in tests/spm-9.
describe('SPM-9 — viewing and changing an event status', () => {
  const underReview = {
    request: { id: 'req-1', status: 'under_review', core: { title: 'A1 under review' } },
    editableSections: ['core'],
    availableActions: ['return_for_clarification', 'approve', 'reject'],
  }

  it('The Organiser and the Coordinator both see the current status', async () => {
    showRequest({ ...underReview, availableActions: [] }, ['organiser'])
    expect(await screen.findByText('Under review')).toBeTruthy()
    cleanup()
    showRequest(underReview, ['coordinator'])
    expect(await screen.findByText('Under review')).toBeTruthy()
  })

  it('No status actions are shown to a user who may not take any', async () => {
    showRequest({ ...underReview, availableActions: [] }, ['organiser'])
    await screen.findByText('A1 under review')
    expect(screen.queryByText('Status actions')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve for planning' })).toBeNull()
  })

  it('Only the actions listed by the API are offered, and one click applies a non-closing action', async () => {
    const user = showRequest(underReview, ['coordinator'])
    await screen.findByText('Status actions')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Return for clarification', 'Approve for planning', 'Reject request']),
    )
    expect(screen.queryByRole('button', { name: 'Confirm event' })).toBeNull()

    transitionRequest.mockResolvedValue({
      request: { ...underReview.request, status: 'planning' },
      editableSections: ['core'],
      availableActions: ['reject'],
    })
    await user.click(screen.getByRole('button', { name: 'Approve for planning' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'approve', undefined)
    expect(await screen.findByText('Status changed to Planning.')).toBeTruthy()
    expect(screen.getByText('Planning', { selector: '.status-pill' })).toBeTruthy()
    // At Planning the Coordinator is told why there is no Confirm button.
    expect(screen.getByText(/can be confirmed once all mandatory venue and technical arrangements are approved/)).toBeTruthy()
  })

  it('Rejecting asks first, and nothing is sent until the user confirms', async () => {
    const user = showRequest(underReview, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Reject request' }))

    expect(screen.getByText(/A rejected request is closed and cannot change status again/)).toBeTruthy()
    expect(transitionRequest).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Go back' }))
    expect(transitionRequest).not.toHaveBeenCalled()

    transitionRequest.mockResolvedValue({ request: { ...underReview.request, status: 'rejected' }, editableSections: [], availableActions: [] })
    await user.click(screen.getByRole('button', { name: 'Reject request' }))
    await user.click(screen.getByRole('button', { name: 'Reject request' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'reject', undefined)
    expect(await screen.findByText('Status changed to Rejected.')).toBeTruthy()
    expect(screen.queryByText('Status actions')).toBeNull()
  })

  it('A refused action shows the reason from the API', async () => {
    const user = showRequest(underReview, ['coordinator'])
    transitionRequest.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 409,
        details: { message: 'This action is not available at the request’s current status.', reason: 'wrong_status' },
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Approve for planning' }))
    expect(await screen.findByText('This action is not available at the request’s current status.')).toBeTruthy()
  })

  it('A transition returning 404 shows the error, retains status and releases the busy state', async () => {
    const user = showRequest(underReview, ['coordinator'])
    transitionRequest.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 404,
        details: { message: 'Event request not found.' },
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Approve for planning' }))
    expect(await screen.findByText('Event request not found.')).toBeTruthy()
    expect(screen.getByText('Under review', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.queryByText(/Status changed to/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Approve for planning' }).disabled).toBe(false)
  })

  it('A resubmission missing mandatory fields names them', async () => {
    const user = showRequest(
      { request: { id: 'req-1', status: 'returned_for_clarification', core: { title: 'Returned' } }, editableSections: ['core'], availableActions: ['resubmit'] },
      ['organiser'],
    )
    transitionRequest.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 400,
        details: { message: 'Validation failed', errors: { 'core.purpose': 'Required before submission.' } },
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Resubmit request' }))
    await waitFor(() => expect(screen.getByText('Complete these fields before resubmitting: core.purpose')).toBeTruthy())
  })
})

describe('SPM-9 — arrangement sign-off and cancellation requests on the page', () => {
  const confirmed = { id: 'req-1', status: 'confirmed', core: { title: 'A1 confirmed' } }

  it('Sign-off progress is shown, including an arrangement that is not required', async () => {
    showRequest(
      {
        request: { id: 'req-1', status: 'planning', core: { title: 'A1 planning' } },
        editableSections: [],
        availableActions: ['reject'],
        arrangements: {
          venue: { required: true, decision: 'approved', at: '2026-09-30T00:00:00.000Z' },
          technical: { required: false, decision: null, at: null },
        },
      },
      ['coordinator'],
    )
    expect(await screen.findByText('Arrangements and cancellation')).toBeTruthy()
    expect(screen.getByText('Venue arrangement').nextSibling.textContent).toBe('Approved')
    expect(screen.getByText('Technical arrangement').nextSibling.textContent).toBe('Not required')
  })

  it('Venue staff approve their arrangement in one click; the status is unchanged', async () => {
    const user = showRequest(
      {
        request: { id: 'req-1', status: 'planning', core: { title: 'A1 planning' } },
        editableSections: ['venue'],
        availableActions: ['approve_venue', 'reject_venue'],
        arrangements: { venue: { required: true, decision: null, at: null } },
      },
      ['venue_staff'],
    )
    expect((await screen.findByText('Venue arrangement')).nextSibling.textContent).toBe('Awaiting approval')

    transitionRequest.mockResolvedValue({
      request: { id: 'req-1', status: 'planning', core: { title: 'A1 planning' } },
      editableSections: ['venue'],
      availableActions: ['approve_venue', 'reject_venue'],
      arrangements: { venue: { required: true, decision: 'approved', at: '2026-10-01T00:00:00.000Z' } },
    })
    await user.click(screen.getByRole('button', { name: 'Approve venue arrangement' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'approve_venue', undefined)
    expect(await screen.findByText('Your decision has been recorded.')).toBeTruthy()
    expect(screen.getByText('Venue arrangement').nextSibling.textContent).toBe('Approved')
  })

  it('The Organiser requests cancellation with an optional reason, and sees it is awaiting a decision', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['request_cancellation'] }, ['organiser'])
    await user.click(await screen.findByRole('button', { name: 'Request cancellation' }))
    expect(screen.getByText(/The event stays confirmed until they decide/)).toBeTruthy()
    await user.type(screen.getByLabelText('Reason (optional)'), 'Keynote speaker withdrew')

    transitionRequest.mockResolvedValue({
      request: confirmed,
      editableSections: [],
      availableActions: [],
      cancellationRequest: { status: 'pending', reason: 'Keynote speaker withdrew', requestedAt: '2026-10-01T00:00:00.000Z' },
    })
    await user.click(screen.getByRole('button', { name: 'Request cancellation' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'request_cancellation', 'Keynote speaker withdrew')
    expect(await screen.findByText(/awaiting the event coordinator/)).toBeTruthy()
    expect(screen.getByText('Keynote speaker withdrew')).toBeTruthy()
    expect(screen.getByText('Confirmed', { selector: '.status-pill' })).toBeTruthy()
  })

  it('A direct cancellation cannot be sent without a reason', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['cancel'] }, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Cancel event' }))

    const send = () => screen.getByRole('group', { name: 'Confirm status change' }).querySelectorAll('button')[1]
    expect(send().disabled).toBe(true)
    await user.type(screen.getByLabelText('Reason (required)'), '   ')
    expect(send().disabled).toBe(true)
    await user.type(screen.getByLabelText('Reason (required)'), 'Venue closed for repairs')
    expect(send().disabled).toBe(false)

    transitionRequest.mockResolvedValue({ request: { ...confirmed, status: 'cancelled' }, editableSections: [], availableActions: [] })
    await user.click(send())
    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'cancel', 'Venue closed for repairs')
    expect(await screen.findByText('Status changed to Cancelled.')).toBeTruthy()
  })

  it('The Coordinator sees a pending request and may approve or refuse it', async () => {
    showRequest(
      {
        request: confirmed,
        editableSections: [],
        availableActions: ['approve_cancellation', 'refuse_cancellation'],
        cancellationRequest: { status: 'pending', reason: 'Budget cut', requestedAt: '2026-10-01T00:00:00.000Z' },
      },
      ['coordinator'],
    )
    expect(await screen.findByRole('button', { name: 'Approve cancellation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refuse cancellation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel event' })).toBeNull()
    expect(screen.getByText('Budget cut')).toBeTruthy()
  })
})
