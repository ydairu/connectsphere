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
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn() }
})

const { getRequest, updateRequest } = await import('../services/api.js')

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
