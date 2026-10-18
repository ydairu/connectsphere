// SPM-28, presentation side: the request page shows the change history panel only when the API says the
// user may view it, renders entries in the order the API sends them (newest first), formats values, shows an
// empty state, and reloads the history after a save. The API is mocked; the rules are covered by
// changeHistoryApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn(), getRequestHistory: vi.fn() }
})

const { getRequest, getRequestHistory, updateRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ENTRIES = [
  { id: 'e3', field: 'internal.planningNotes', oldValue: null, newValue: 'Hall B held', actor: { type: 'user', name: 'Seed Coordinator', role: 'coordinator' }, at: '2026-09-14T10:00:00.000Z' },
  { id: 'e2', field: 'equipment.requirements', oldValue: ['projector'], newValue: ['projector', 'microphone'], actor: { type: 'user', name: 'Seed Technical Staff', role: 'technical_staff' }, at: '2026-09-13T10:00:00.000Z' },
  { id: 'e1', field: 'core.expectedAttendees', oldValue: 60, newValue: 80, actor: { type: 'user', name: 'Seed Coordinator', role: 'coordinator' }, at: '2026-09-12T10:00:00.000Z' },
]

function response({ canViewChangeHistory = true, editableSections = [] } = {}) {
  return {
    request: { id: 'req-1', status: 'planning', core: { title: 'Partner summit', purpose: 'Partners', expectedAttendees: 80 } },
    editableSections,
    availableActions: [],
    canViewChangeHistory,
  }
}

function showRequest(body, roles = ['coordinator']) {
  getRequest.mockResolvedValue(body)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'User' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1?tab=change-log']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const panel = () => screen.getByRole('heading', { name: 'Change history' }).closest('.request-form-section')

describe('SPM-28 — the Change history panel', () => {
  it('lists entries in the order received (newest first) with label, old → new, user and time', async () => {
    getRequestHistory.mockResolvedValue({ entries: ENTRIES })
    showRequest(response())
    const list = await screen.findByRole('list', { name: 'Change history entries' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Internal planning · Planning notes',
      'Equipment and technical support · Equipment required (one per line)',
      'Event details · Expected attendees',
    ])
    expect(rows[0].textContent).toContain('— → Hall B held')
    expect(rows[0].textContent).toContain('Seed Coordinator (Event Coordinator)')
    expect(rows[0].textContent).toContain('2026')
    expect(rows[1].textContent).toContain('projector → projector, microphone')
    expect(rows[1].textContent).toContain('Seed Technical Staff (Technical Support Staff)')
    expect(rows[2].textContent).toContain('60 → 80')
    expect(getRequestHistory).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1')
  })

  it('shows the empty state', async () => {
    getRequestHistory.mockResolvedValue({ entries: [] })
    showRequest(response(), ['organiser'])
    expect(await within(await screen.findByRole('heading', { name: 'Change history' }).then(() => panel())).findByText('No changes recorded yet.')).toBeTruthy()
  })

  it('is hidden, and the history never requested, for a user the API does not allow', async () => {
    showRequest(response({ canViewChangeHistory: false }), ['venue_staff'])
    expect(await screen.findByRole('heading', { name: 'Partner summit' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Change history' })).toBeNull()
    expect(getRequestHistory).not.toHaveBeenCalled()
  })

  it('reports a failed load without breaking the page', async () => {
    getRequestHistory.mockRejectedValue(new Error('network'))
    showRequest(response())
    expect(await within(await screen.findByRole('heading', { name: 'Change history' }).then(() => panel())).findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Partner summit' })).toBeTruthy()
  })

  it('reloads after a save, so the new entry appears', async () => {
    getRequestHistory.mockResolvedValueOnce({ entries: [] })
    const user = showRequest(response({ editableSections: ['core'] }))
    await within(await screen.findByRole('heading', { name: 'Change history' }).then(() => panel())).findByText('No changes recorded yet.')

    updateRequest.mockResolvedValue({ ...response({ editableSections: ['core'] }), request: { ...response().request, core: { ...response().request.core, title: 'Summit 2' } } })
    getRequestHistory.mockResolvedValueOnce({
      entries: [{ id: 'n1', field: 'core.title', oldValue: 'Partner summit', newValue: 'Summit 2', actor: { type: 'user', name: 'User', role: 'coordinator' }, at: '2026-10-04T10:00:00.000Z' }],
    })
    await user.click(screen.getByRole('tab', { name: 'Event Status' }))
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Summit 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await user.click(screen.getByRole('tab', { name: 'Change Log' }))

    await waitFor(() => expect(getRequestHistory).toHaveBeenCalledTimes(2))
    const row = await within(panel()).findByRole('listitem', { name: 'Event details · Title' })
    expect(row.textContent).toContain('Partner summit → Summit 2')
  })
})
