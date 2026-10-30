// SPM-87, presentation side: the assigned Coordinator sees the sign-offs marked "Changed since approval",
// sends back the chosen ones or records that none need re-approval, and is told why the safety check and
// Confirm wait. The API is mocked; the rules are covered by signOffReviewApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), decideSignOffReview: vi.fn(), getVenueBookings: vi.fn(async () => ({ bookings: [], canSubmit: false })) }
})

const { getRequest, decideSignOffReview } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ITEMS = [
  { key: 'venue:hall', kind: 'venue', label: 'Hall' },
  { key: 'technical', kind: 'technical', label: 'Technical arrangement' },
]

function response(signOffReview, overrides = {}) {
  return {
    request: { id: 'req-1', status: 'planning', core: { title: 'Summit', expectedAttendees: 90 } },
    editableSections: [],
    availableActions: ['reject'],
    arrangements: { venue: { required: true, decision: 'approved', at: null }, technical: { required: true, decision: 'approved', at: 'x' } },
    signOffReview,
    ...overrides,
  }
}

function show(body) {
  getRequest.mockResolvedValue(body)
  render(
    <AuthContext.Provider value={{ user: { uid: 'c' }, userProfile: { name: 'Coordinator' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const pending = { status: 'pending', changedAt: '2026-10-29T03:00:00.000Z', changedFields: ['core.expectedAttendees'], items: ITEMS, reapprove: null, decidedAt: null }

describe('SPM-87 — the Coordinator decides which sign-offs need re-approval', () => {
  it('shows each sign-off as Changed since approval, and why the safety check and Confirm wait', async () => {
    show(response(pending))
    const group = await screen.findByRole('group', { name: 'Choose sign-offs to send back' })
    expect(within(group).getByLabelText('Hall — Changed since approval')).toBeTruthy()
    expect(within(group).getByLabelText('Technical arrangement — Changed since approval')).toBeTruthy()
    expect(screen.getByText(/Significant change on .*: Event details · Expected attendees\./)).toBeTruthy()
    expect(screen.getByText(/Choose which need re-approval, or record that none do/)).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Send selected back for re-approval' }).disabled).toBe(true)
  })

  it('sends back only the selected sign-offs and shows the result', async () => {
    const user = show(response(pending))
    decideSignOffReview.mockResolvedValue(response({ ...pending, status: 'decided', reapprove: ['venue:hall'], decidedAt: '2026-10-29T04:00:00.000Z' }))
    await user.click(await screen.findByLabelText('Hall — Changed since approval'))
    expect(screen.getByRole('button', { name: 'None need re-approval' }).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Send selected back for re-approval' }))
    expect(decideSignOffReview).toHaveBeenCalledWith({ uid: 'c' }, 'req-1', ['venue:hall'])
    expect(await screen.findByText('The selected sign-offs were sent back for re-approval.')).toBeTruthy()
    expect(screen.getByText('Sent back for re-approval: Hall')).toBeTruthy()
  })

  it('records that none need re-approval', async () => {
    const user = show(response(pending))
    decideSignOffReview.mockResolvedValue(response({ ...pending, status: 'decided', reapprove: [], decidedAt: '2026-10-29T04:00:00.000Z' }))
    await user.click(await screen.findByRole('button', { name: 'None need re-approval' }))
    expect(decideSignOffReview).toHaveBeenCalledWith({ uid: 'c' }, 'req-1', [])
    expect(await screen.findByText('None need re-approval; the existing approvals stay valid.')).toBeTruthy()
  })

  it('shows nothing when the API sends no review', async () => {
    show(response(null))
    await screen.findByRole('heading', { name: 'Summit' })
    expect(screen.queryByRole('group', { name: 'Choose sign-offs to send back' })).toBeNull()
  })
})
