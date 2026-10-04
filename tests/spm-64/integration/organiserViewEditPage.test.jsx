// SPM-64, presentation side: the Organiser's event page is read-only after submission, shows the status and
// the arrangements as requested with their sign-off state, and uses one sign-off wording on every card.
// The API is mocked here; the rules are covered by organiserViewEditApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import { NOT_REVIEWED_CLOSED, NOT_STARTED } from '../../../frontend/src/utils/eventArrangements.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function organiserResponse(status, { arrangements, editableSections = [] } = {}) {
  return {
    request: {
      id: 'req-1',
      status,
      core: { title: 'Partner summit', purpose: 'Partners', description: null, preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 4, expectedAttendees: 80 },
      venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: null },
      equipment: { requirements: ['projector'], technicalSupportNeeded: true },
      registration: { enabled: false, notes: null },
    },
    editableSections,
    availableActions: [],
    arrangements: arrangements ?? {
      venue: { required: true, decision: null, at: null },
      technical: { required: true, decision: null, at: null },
    },
  }
}

function showRequest(response, roles = ['organiser']) {
  getRequest.mockResolvedValue(response)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Organiser' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const summary = () => screen.getByRole('heading', { name: 'Your event arrangements' }).closest('.request-form-section')
const summaryRow = (label) => within(summary()).getByLabelText(label)
const statusCardValue = (label) => screen.getByText(label).nextSibling.textContent

describe('SPM-64 AC3 — read-only after submission', () => {
  it.each([
    ['submitted', 'Submitted'],
    ['under_review', 'Under review'],
    ['planning', 'Planning'],
    ['confirmed', 'Confirmed'],
  ])('at %s: no editable field, no Save, and the read-only note', async (status, label) => {
    showRequest(organiserResponse(status))
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(document.querySelector('.page-heading .status-pill').textContent).toBe(label)
    expect(screen.queryAllByRole('textbox')).toEqual([])
    expect(screen.queryAllByRole('spinbutton')).toEqual([])
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(screen.getByText('You can view this request but cannot change it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Request change/i })).toBeNull()
  })
})

describe('SPM-64 AC5 — status and arrangements', () => {
  it('shows date and time, venue and equipment labelled "Requested", with the sign-off state', async () => {
    showRequest(organiserResponse('planning', {
      arrangements: { venue: { required: true, decision: 'approved', at: null }, technical: { required: true, decision: null, at: null } },
    }))
    await screen.findByRole('heading', { name: 'Your event arrangements' })

    expect(summaryRow('Date and time').textContent).toMatch(/^Date and timeRequested: .*2026.*4 hours$/)
    expect(summaryRow('Venue').textContent).toContain('Requested: theatre layout · Accessibility required')
    expect(summaryRow('Venue').textContent).toContain('Sign-off: Approved')
    expect(summaryRow('Equipment').textContent).toContain('Requested: projector, technical support')
    expect(summaryRow('Equipment').textContent).toContain('Sign-off: Awaiting approval')
  })

  it('before Planning, both cards say the sign-off has not started — one label for one sign-off', async () => {
    showRequest(organiserResponse('under_review'))
    await screen.findByRole('heading', { name: 'Your event arrangements' })

    expect(summaryRow('Venue').textContent).toContain(`Sign-off: ${NOT_STARTED}`)
    expect(summaryRow('Equipment').textContent).toContain(`Sign-off: ${NOT_STARTED}`)
    expect(statusCardValue('Venue arrangement')).toBe(NOT_STARTED)
    expect(statusCardValue('Technical arrangement')).toBe(NOT_STARTED)
    expect(screen.queryByText(/Awaiting approval/)).toBeNull()
  })

  it.each(['submitted', 'returned_for_clarification'])('at %s the existing card also says not started', async (status) => {
    showRequest(organiserResponse(status, { editableSections: status === 'submitted' ? [] : ['core'] }))
    await screen.findByText('Venue arrangement')
    expect(statusCardValue('Venue arrangement')).toBe(NOT_STARTED)
  })

  it('from Planning on, both cards keep the existing wording', async () => {
    showRequest(organiserResponse('planning'))
    await screen.findByRole('heading', { name: 'Your event arrangements' })
    expect(statusCardValue('Venue arrangement')).toBe('Awaiting approval')
    expect(summaryRow('Venue').textContent).toContain('Sign-off: Awaiting approval')
    expect(screen.queryByText(new RegExp(NOT_STARTED))).toBeNull()
  })

  it('a request rejected before Planning: both cards say the undecided sign-offs were not reviewed', async () => {
    showRequest({
      ...organiserResponse('rejected'),
      rejection: { reason: 'Venue unavailable on that date', rejectedAt: '2026-10-02T09:00:00.000Z', previousStatus: 'under_review' },
    })
    await screen.findByRole('heading', { name: 'Your event arrangements' })
    expect(screen.getByRole('heading', { name: 'Request rejected' })).toBeTruthy()

    expect(summaryRow('Venue').textContent).toContain(`Sign-off: ${NOT_REVIEWED_CLOSED}`)
    expect(summaryRow('Equipment').textContent).toContain(`Sign-off: ${NOT_REVIEWED_CLOSED}`)
    expect(statusCardValue('Venue arrangement')).toBe(NOT_REVIEWED_CLOSED)
    expect(statusCardValue('Technical arrangement')).toBe(NOT_REVIEWED_CLOSED)
    expect(screen.queryByText(/Awaiting approval/)).toBeNull()
    expect(screen.queryByText(new RegExp(NOT_STARTED))).toBeNull()
  })

  it('"Not required" equipment sign-off reads the same on both cards', async () => {
    showRequest(organiserResponse('planning', {
      arrangements: { venue: { required: true, decision: null, at: null }, technical: { required: false, decision: null, at: null } },
    }))
    await screen.findByRole('heading', { name: 'Your event arrangements' })
    expect(statusCardValue('Technical arrangement')).toBe('Not required')
    expect(summaryRow('Equipment').textContent).toContain('Sign-off: Not required')
  })

  it.each([['coordinator'], ['venue_staff'], ['attendee']])('a %s does not get the Organiser summary', async (role) => {
    showRequest(organiserResponse('planning'), [role])
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your event arrangements' })).toBeNull()
  })

  it('no internal section is rendered, because the API sends none', async () => {
    showRequest(organiserResponse('confirmed'))
    await screen.findByRole('heading', { name: 'Partner summit' })
    expect(screen.queryByRole('heading', { name: 'Internal planning' })).toBeNull()
  })
})
