// SPM-91 / SPM-92 / SPM-66, presentation side: the request page shows "Pending safety check" beside Planning;
// the Safety Officer sees the booked venues and the checklist form, records a review and is taken back to the
// queue; a refused review shows each error beside its field; the Organiser sees the outcome and comments; the
// Coordinator's action is labelled. The API is mocked; the rules are covered by safetyReviewApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import { SAFETY_CHECKLIST_ITEMS } from '../../../shared/safetyReview.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), getSafetyVenueDetails: vi.fn(), recordSafetyReview: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, getSafetyVenueDetails, recordSafetyReview } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const REQUEST = {
  id: 'req-1',
  status: 'planning',
  core: { title: 'Partner summit', expectedAttendees: 80 },
  venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Step-free access' },
  equipment: { requirements: ['projector'], technicalSupportNeeded: true },
}

function response(overrides = {}) {
  return { request: REQUEST, editableSections: [], availableActions: [], canViewChangeHistory: true, ...overrides }
}

function showRequest(body, roles) {
  getRequest.mockResolvedValue(body)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'User' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/requests" element={<p>Queue page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const officerResponse = () => response({
  safetyReview: { status: 'pending', submittedAt: '2026-10-26T00:00:00.000Z', invalidatedAt: null, invalidatedReason: null, reviews: [] },
  canDecideSafetyReview: true,
})

describe('SPM-66 / SPM-92 — the Safety Officer’s review', () => {
  it('shows "Pending safety check" beside Planning, the booked venue and every checklist item', async () => {
    getSafetyVenueDetails.mockResolvedValue({ venues: [{
      bookingRequestId: 'b-1', venueName: 'Seed Hall', attendeeCount: 80, maximumCapacity: 60, supportedLayouts: ['Theatre'],
      accessibilityFeatures: ['Wheelchair access'], facilities: [], operatingHours: 'Daily 08:00-22:00', requirements: 'Theatre layout',
      capacityWarning: 'Expected attendance (80) exceeds venue capacity (60). Venue Staff must review this request.',
    }] })
    showRequest(officerResponse(), ['safety_officer'])

    expect((await screen.findAllByText('Pending safety check')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Planning').length).toBeGreaterThan(0)
    const venue = await screen.findByLabelText('Seed Hall')
    expect(within(venue).getByText('60')).toBeTruthy()
    expect(within(venue).getByText('Daily 08:00-22:00')).toBeTruthy()
    expect(within(venue).getByText(/exceeds venue capacity/)).toBeTruthy()
    for (const item of SAFETY_CHECKLIST_ITEMS) expect(screen.getByRole('group', { name: item.label })).toBeTruthy()
    expect(screen.getByText('You can view this request but cannot change it.')).toBeTruthy()
  })

  it('records the review and returns to the queue', async () => {
    getSafetyVenueDetails.mockResolvedValue({ venues: [] })
    recordSafetyReview.mockResolvedValue({ recorded: true, outcome: 'request_changes', safetyReviewStatus: 'changes_requested' })
    const user = showRequest(officerResponse(), ['safety_officer'])

    for (const item of SAFETY_CHECKLIST_ITEMS) {
      await user.selectOptions(await screen.findByLabelText('Result', { selector: `#safety-${item.id}-result` }), 'satisfactory')
    }
    await user.type(screen.getByLabelText('Comment', { selector: '#safety-emergencyAccess-comment' }), 'Exit B partly blocked')
    await user.click(screen.getByRole('radio', { name: 'Request changes' }))
    expect(screen.getByLabelText('Comments for the coordinator and organiser (required)')).toBeTruthy()
    await user.type(screen.getByLabelText('Comments for the coordinator and organiser (required)'), 'Clear exit B')
    await user.type(screen.getByLabelText('Internal notes (not shown to the organiser)'), 'Seen on site visit')
    await user.click(screen.getByRole('button', { name: 'Record safety review' }))

    expect(recordSafetyReview).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', expect.objectContaining({
      outcome: 'request_changes',
      comments: 'Clear exit B',
      internalNotes: 'Seen on site visit',
      checklist: expect.objectContaining({ emergencyAccess: { result: 'satisfactory', comment: 'Exit B partly blocked' } }),
    }))
    expect(await screen.findByText('Queue page')).toBeTruthy()
  })

  it('a refused review shows each error beside its field and stays on the page', async () => {
    getSafetyVenueDetails.mockResolvedValue({ venues: [] })
    recordSafetyReview.mockRejectedValue(new ApiRequestError('Validation failed', {
      status: 400,
      details: { errors: { 'checklist.layout': 'Choose a result for this item.', comments: 'Comments are required when requesting changes or rejecting the safety arrangement.' } },
    }))
    const user = showRequest(officerResponse(), ['safety_officer'])
    await user.click(await screen.findByRole('button', { name: 'Record safety review' }))

    expect(await screen.findByText('Please complete the highlighted fields.')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Layout' })).getByText('Choose a result for this item.')).toBeTruthy()
    expect(screen.getByText(/Comments are required/)).toBeTruthy()
    expect(screen.queryByText('Queue page')).toBeNull()
  })
})

describe('SPM-91 / SPM-92 — what the Coordinator and the Organiser see', () => {
  it('the Coordinator is offered "Submit for safety review" and told why Confirm is not yet available', async () => {
    showRequest(response({ availableActions: ['reject', 'submit_safety_review'] }), ['coordinator'])
    expect(await screen.findByRole('button', { name: 'Submit for safety review' })).toBeTruthy()
    expect(screen.getByText('The arrangements are approved. The event can be confirmed once it passes its safety check.')).toBeTruthy()
  })

  it('the Organiser sees the outcome and the comments, with no internal notes or checklist', async () => {
    showRequest(response({
      safetyReview: { status: 'changes_requested', outcome: 'request_changes', comments: 'Clear exit B', reviewedAt: '2026-10-27T03:00:00.000Z' },
    }), ['organiser'])
    const card = (await screen.findByRole('heading', { name: 'Safety check' })).closest('.request-form-section')
    expect(within(card).getByText('Safety changes requested')).toBeTruthy()
    expect(within(card).getByText('Request changes')).toBeTruthy()
    expect(within(card).getByText('Clear exit B')).toBeTruthy()
    expect(within(card).queryByText('Internal notes')).toBeNull()
    expect(within(card).queryByText('Emergency access')).toBeNull()
  })
})
