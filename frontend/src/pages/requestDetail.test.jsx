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
    venuePreparation: { status: 'not_started', notes: '' },
  },
  // SPM-48: Venue Staff edit venue preparation only; the requested venue is read-only to them.
  editableSections: ['venuePreparation'],
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
  it('groups sections in the requested tab order and keeps edits while switching tabs', async () => {
    const user = showRequest({ request: { ...venueStaffResponse.request, equipment: { requirements: ['projector'] }, registration: { enabled: false }, internal: { planningNotes: '' } },
      editableSections: ['core', 'venue', 'equipment', 'registration', 'internal', 'venuePreparation'] }, ['coordinator'])
    expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent)).toEqual(['Event Status', 'Venue Details', 'Equipment Required', 'Change Log'])
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Updated event')
    await user.click(screen.getByRole('tab', { name: 'Venue Details' }))
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Venue', 'Venue preparation', 'Venue bookings', 'Venue booking requests'])
    await user.click(screen.getByRole('tab', { name: 'Equipment Required' }))
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Equipment and technical support', 'Registration', 'Equipment requests'])
    await user.click(screen.getByRole('tab', { name: 'Event Status' }))
    expect(screen.getByLabelText('Title').value).toBe('Updated event')
  })

  it('Venue staff see the venue section and edit venue preparation, and the equipment section is absent', async () => {
    showRequest(venueStaffResponse)
    await screen.findByText('Event details')
    await userEvent.click(screen.getByRole('tab', { name: 'Venue Details' }))
    expect(screen.getByRole('heading', { name: 'Venue' })).toBeTruthy()
    expect(screen.queryByText('Equipment and technical support')).toBeNull()
    // SPM-48: their own section is venue preparation; the requested venue and main details are read-only.
    expect(screen.getByLabelText('Venue preparation status')).toBeTruthy()
    expect(screen.queryByLabelText('Layout preference')).toBeNull()
    expect(screen.queryByLabelText('Title')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Event Status' }))
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
    // SPM-48: Venue Staff's editable field is in venue preparation.
    const user = showRequest(venueStaffResponse)
    await user.click(await screen.findByRole('tab', { name: 'Venue Details' }))
    const notes = await screen.findByLabelText('Venue preparation notes')
    await user.type(notes, 'Chairs booked')

    updateRequest.mockRejectedValueOnce(
      new ApiRequestError('API_REQUEST_FAILED', { status: 403, details: { forbiddenFields: ['venuePreparation.notes'] } }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateRequest).toHaveBeenCalled())
    expect(updateRequest.mock.calls[0][2]).toEqual({ venuePreparation: { notes: 'Chairs booked' } })
    expect(await screen.findByText('You are not allowed to change: venuePreparation.notes')).toBeTruthy()
  })

  it('A successful save reports the change', async () => {
    // SPM-48: Venue Staff's editable field is in venue preparation.
    const user = showRequest(venueStaffResponse)
    await user.click(await screen.findByRole('tab', { name: 'Venue Details' }))
    await user.selectOptions(await screen.findByLabelText('Venue preparation status'), 'in_progress')

    updateRequest.mockResolvedValueOnce({
      request: { ...venueStaffResponse.request, venuePreparation: { status: 'in_progress', notes: '' } },
      editableSections: ['venuePreparation'],
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
    // SPM-45: a rejection requires a reason.
    await user.type(screen.getByLabelText('Rejection reason (required)'), 'No venue can hold 500 attendees')
    await user.click(screen.getByRole('button', { name: 'Reject request' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'reject', 'No venue can hold 500 attendees')
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

  // SPM-47 made the reason required (it was optional under SPM-9).
  it('The Organiser requests cancellation with a reason, and sees it is awaiting a decision', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['request_cancellation'] }, ['organiser'])
    await user.click(await screen.findByRole('button', { name: 'Request cancellation' }))
    expect(screen.getByText(/The event stays confirmed until they decide/)).toBeTruthy()
    await user.type(screen.getByLabelText('Reason (required)'), 'Keynote speaker withdrew')

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

// SPM-5, presentation side: the Coordinator reviews the request's details and approves it for Planning.
// The API is mocked; the rules are covered in tests/spm-5.
describe('SPM-5 — reviewing and approving for Planning', () => {
  const reviewRequest = {
    id: 'req-1',
    status: 'submitted',
    core: { title: 'Partner Forum', purpose: 'Partner updates', expectedAttendees: 80, durationHours: 4, preferredDateTime: '2026-11-20T09:00' },
    venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Wheelchair access' },
    equipment: { requirements: ['projector'], technicalSupportNeeded: true },
  }

  it('spm5_the_coordinator_sees_every_review_input_and_starts_review', async () => {
    const user = showRequest(
      { request: reviewRequest, editableSections: ['core', 'venue', 'equipment'], availableActions: ['start_review'] },
      ['coordinator'],
    )
    expect(await screen.findByRole('button', { name: 'Start review' })).toBeTruthy()
    expect(screen.getByLabelText('Title').value).toBe('Partner Forum')
    expect(screen.getByLabelText('Expected attendees').value).toBe('80')
    expect(screen.getByLabelText('Duration (hours)').value).toBe('4')
    expect(screen.getByLabelText('Preferred date and time').value).toBe('2026-11-20T09:00')
    await user.click(screen.getByRole('tab', { name: 'Venue Details' }))
    expect(screen.getByLabelText('Layout preference').value).toBe('theatre')
    expect(screen.getByLabelText('Accessibility required').checked).toBe(true)
    expect(screen.getByLabelText('Accessibility needs').value).toBe('Wheelchair access')
    await user.click(screen.getByRole('tab', { name: 'Equipment Required' }))
    expect(screen.getByLabelText('Equipment required (one per line)').value).toBe('projector')
    await user.click(screen.getByRole('tab', { name: 'Event Status' }))

    transitionRequest.mockResolvedValue({
      request: { ...reviewRequest, status: 'under_review' },
      editableSections: ['core', 'venue', 'equipment'],
      availableActions: ['return_for_clarification', 'approve', 'reject'],
    })
    await user.click(screen.getByRole('button', { name: 'Start review' }))
    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'start_review', undefined)
    expect(await screen.findByText('Status changed to Under review.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve for planning' })).toBeTruthy()
  })

  it('spm5_without_approve_at_under_review_the_coordinator_is_told_why', async () => {
    showRequest(
      {
        request: { ...reviewRequest, status: 'under_review', core: { ...reviewRequest.core, title: null } },
        editableSections: ['core'],
        availableActions: ['return_for_clarification', 'reject'],
      },
      ['coordinator'],
    )
    expect(await screen.findByText(/can be approved for planning once its required details are complete and valid/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve for planning' })).toBeNull()
  })

  it('spm5_no_note_when_approve_is_available', async () => {
    showRequest(
      { request: { ...reviewRequest, status: 'under_review' }, editableSections: ['core'], availableActions: ['return_for_clarification', 'approve', 'reject'] },
      ['coordinator'],
    )
    await screen.findByRole('button', { name: 'Approve for planning' })
    expect(screen.queryByText(/can be approved for planning once/)).toBeNull()
  })

  it('spm5_an_approval_refused_for_missing_details_shows_the_api_message', async () => {
    const user = showRequest(
      { request: { ...reviewRequest, status: 'under_review' }, editableSections: ['core'], availableActions: ['return_for_clarification', 'approve', 'reject'] },
      ['coordinator'],
    )
    transitionRequest.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 409,
        details: { message: 'The request is missing required details or has invalid ones. Complete them, or return it for clarification.', reason: 'insufficient_information' },
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Approve for planning' }))
    expect(await screen.findByText(/missing required details or has invalid ones/)).toBeTruthy()
    expect(screen.getByText('Under review', { selector: '.status-pill' })).toBeTruthy()
  })
})

// SPM-25, presentation side: Return for Clarification takes a required message, and the Organiser of a
// returned request sees it above editable sections. The API is mocked; the rules are covered in tests/spm-25.
describe('SPM-25 — returning a request for clarification', () => {
  const underReview = {
    request: { id: 'req-1', status: 'under_review', core: { title: 'A1 under review' } },
    editableSections: ['core'],
    availableActions: ['return_for_clarification', 'approve', 'reject'],
  }
  const returned = {
    request: {
      id: 'req-1',
      status: 'returned_for_clarification',
      core: { title: 'A1 returned', purpose: 'Partners', expectedAttendees: 80 },
      venue: { layoutPreference: 'theatre' },
      equipment: { requirements: ['Projector'], technicalSupportNeeded: false },
      registration: { enabled: false },
    },
    editableSections: ['core', 'venue', 'equipment', 'registration'],
    availableActions: ['resubmit'],
    clarificationRequests: [
      { message: 'Please confirm the expected attendance.', requestedAt: '2026-10-02T02:00:00.000Z' },
      { message: 'Which room layout do you need?', requestedAt: '2026-10-01T02:00:00.000Z' },
    ],
  }

  it('spm25_return_cannot_be_sent_without_a_message', async () => {
    const user = showRequest(underReview, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Return for clarification' }))

    const send = () => screen.getByRole('group', { name: 'Confirm status change' }).querySelectorAll('button')[1]
    const message = screen.getByLabelText('Message to the organiser (required)')
    expect(send().disabled).toBe(true)
    await user.type(message, '   ')
    expect(send().disabled).toBe(true)
    await user.type(message, 'Please confirm the expected attendance.')
    expect(send().disabled).toBe(false)

    transitionRequest.mockResolvedValue({
      request: { ...underReview.request, status: 'returned_for_clarification' },
      editableSections: ['core'],
      availableActions: [],
      clarificationRequests: [{ message: 'Please confirm the expected attendance.', requestedAt: '2026-10-02T02:00:00.000Z' }],
    })
    await user.click(send())

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'return_for_clarification', 'Please confirm the expected attendance.')
    expect(await screen.findByText('Status changed to Returned for clarification.')).toBeTruthy()
  })

  it('spm25_the_organiser_sees_the_latest_message_and_every_section_is_editable', async () => {
    showRequest(returned, ['organiser'])
    expect(await screen.findByText('Clarification requested')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Clarification message' }).textContent).toBe('Please confirm the expected attendance.')
    // The earlier message is kept as history, below the current one.
    expect(screen.getByText('Earlier messages')).toBeTruthy()
    expect(screen.getByText('Which room layout do you need?')).toBeTruthy()

    // By heading: SPM-64's arrangements summary also has a "Venue" row for Organisers.
    expect(screen.getByRole('heading', { name: 'Event details' })).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Venue Details' }))
    expect(screen.getByRole('heading', { name: 'Venue' })).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Equipment Required' }))
    for (const heading of ['Equipment and technical support', 'Registration']) expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Event Status' }))
    expect(screen.queryByText('Read only')).toBeNull()
    expect(screen.getByLabelText('Title')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resubmit request' })).toBeTruthy()
  })

  it('spm25_after_resubmission_the_messages_remain_as_history', async () => {
    const user = showRequest(returned, ['organiser'])
    transitionRequest.mockResolvedValue({
      ...returned,
      request: { ...returned.request, status: 'submitted' },
      editableSections: [],
      availableActions: [],
    })
    await user.click(await screen.findByRole('button', { name: 'Resubmit request' }))

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'resubmit', undefined)
    expect(await screen.findByText('Status changed to Submitted.')).toBeTruthy()
    expect(screen.getByText('Clarification history')).toBeTruthy()
    expect(screen.queryByText('Clarification requested')).toBeNull()
    expect(screen.getByText('Please confirm the expected attendance.')).toBeTruthy()
  })

  it('spm25_a_returned_request_without_a_stored_message_shows_no_message_panel', async () => {
    showRequest({ ...returned, clarificationRequests: null }, ['organiser'])
    await screen.findByText('A1 returned')
    expect(screen.queryByText('Clarification requested')).toBeNull()
  })
})
