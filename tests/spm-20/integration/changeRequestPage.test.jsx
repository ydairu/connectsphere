// SPM-20 / SPM-40, presentation side: the Organiser requests a change from the event page; the Coordinator sees it
// flagged with what it may affect, and decides it. The API is mocked; the rules are in changeRequestApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import { ApiRequestError } from '../../../frontend/src/services/api.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRequest: vi.fn(),
    submitChangeRequest: vi.fn(),
    decideChangeRequest: vi.fn(),
    getChangeRequestAssessment: vi.fn(),
    getVenueBookings: vi.fn(async () => ({ bookings: [], canSubmit: false })),
  }
})

const { getRequest, submitChangeRequest, decideChangeRequest, getChangeRequestAssessment } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const REQUEST = {
  id: 'req-1', status: 'confirmed',
  core: { title: 'Summit', purpose: 'Partners', expectedAttendees: 100, durationHours: 2, preferredDateTime: '2027-03-01T10:00:00.000Z' },
  venue: { layoutPreference: 'Theatre' },
  equipment: { requirements: [], technicalSupportNeeded: false },
}
const PENDING = {
  status: 'pending', reason: 'More guests', requestedAt: 'x', decisionReason: null, decidedAt: null, significant: true,
  changes: [{ field: 'core.expectedAttendees', current: 100, proposed: 120, significant: true }],
}

function response(overrides = {}) {
  return { request: REQUEST, editableSections: [], availableActions: [], canSubmitChangeRequest: false, changeRequest: null, ...overrides }
}

function show(body, roles) {
  getRequest.mockResolvedValue(body)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u' }, userProfile: { name: 'User' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-20 — the Organiser', () => {
  it('sends only the changed fields, with the reason', async () => {
    const user = show(response({ canSubmitChangeRequest: true }), ['organiser'])
    submitChangeRequest.mockResolvedValue(response({ changeRequest: { ...PENDING, decisions: [] } }))
    await user.click(await screen.findByRole('button', { name: 'Request a change' }))
    const form = screen.getByRole('group', { name: 'Request a change' })
    expect(within(form).queryByLabelText(/Registration/)).toBeNull()
    await user.clear(within(form).getByLabelText('Expected attendees'))
    await user.type(within(form).getByLabelText('Expected attendees'), '120')
    await user.type(within(form).getByLabelText('Reason for the change (optional)'), 'More guests')
    await user.click(within(form).getByRole('button', { name: 'Send change request' }))
    expect(submitChangeRequest).toHaveBeenCalledWith({ uid: 'u' }, 'req-1', { changes: { core: { expectedAttendees: 120 } }, reason: 'More guests' })
    expect(await screen.findByText('Your change request was sent to the event coordinator.')).toBeTruthy()
    expect(screen.getByText('Awaiting the event coordinator’s decision')).toBeTruthy()
  })

  it('sends nothing when nothing changed; shows a refused field beside it', async () => {
    const user = show(response({ canSubmitChangeRequest: true }), ['organiser'])
    await user.click(await screen.findByRole('button', { name: 'Request a change' }))
    await user.click(screen.getByRole('button', { name: 'Send change request' }))
    expect(screen.getByText('Change at least one field.')).toBeTruthy()
    expect(submitChangeRequest).not.toHaveBeenCalled()

    submitChangeRequest.mockRejectedValue(new ApiRequestError('Validation failed', { status: 400, details: { errors: { 'core.title': 'Required.' } } }))
    await user.clear(screen.getByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Send change request' }))
    expect(await screen.findByText('Required.')).toBeTruthy()
  })

  it('a returned request shows the message and can be modified', async () => {
    show(response({ canSubmitChangeRequest: true, changeRequest: { ...PENDING, status: 'returned', decisionReason: 'Lower it please', decisions: [] } }), ['organiser'])
    expect(await screen.findByText('Lower it please')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Modify and resubmit' })).toBeTruthy()
  })
})

describe('SPM-40 — the Coordinator', () => {
  const coordinatorView = response({ changeRequest: { ...PENDING, decisions: ['accept', 'decline', 'return'] } })

  it('sees the flagged proposal and what it may affect', async () => {
    getChangeRequestAssessment.mockResolvedValue({
      affected: [{ key: 'venue:hall', kind: 'venue', label: 'Hall' }],
      venues: [{ bookingId: 'hall', venueName: 'Hall', problems: [{ message: 'Over capacity' }], warnings: [] }],
    })
    show(coordinatorView, ['coordinator'])
    expect(await screen.findByText(/Significant change\./)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Requested changes' })).getByText(/100 → 120 \(significant\)/)).toBeTruthy()
    const assessment = await screen.findByRole('group', { name: 'Assessment of the proposed change' })
    expect(within(assessment).getByText('Hall')).toBeTruthy()
    expect(within(assessment).getByText('Over capacity')).toBeTruthy()
  })

  it('is told why the safety check and Confirm wait for a significant request', async () => {
    getChangeRequestAssessment.mockResolvedValue({ affected: [], venues: [] })
    show(response({ request: { ...REQUEST, status: 'planning' }, availableActions: ['reject'], changeRequest: { ...PENDING, decisions: ['accept'] } }), ['coordinator'])
    expect(await screen.findByText(/significant change request is waiting for your decision/)).toBeTruthy()
  })

  it('accepts, and shows a refusal without losing the page', async () => {
    getChangeRequestAssessment.mockResolvedValue({ affected: [], venues: [] })
    const user = show(coordinatorView, ['coordinator'])
    decideChangeRequest.mockRejectedValueOnce(new ApiRequestError('Validation failed', { status: 400, details: { errors: { reason: 'Give the organiser a reason.' } } }))
    await user.click(await screen.findByRole('button', { name: 'Decline change' }))
    expect(await screen.findByText('Give the organiser a reason.')).toBeTruthy()

    decideChangeRequest.mockResolvedValue(response({ changeRequest: { ...PENDING, status: 'accepted', decisions: [] } }))
    await user.click(screen.getByRole('button', { name: 'Accept change' }))
    expect(decideChangeRequest).toHaveBeenLastCalledWith({ uid: 'u' }, 'req-1', { decision: 'accept', reason: undefined })
    expect(await screen.findByText('Change accepted and saved.')).toBeTruthy()
  })
})
