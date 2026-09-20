// SPM-24 — the saved drafts page. The API is mocked; that drafts reach only their owner is enforced and
// tested at the API level (backend/src/routes/requestRoutes.cases.js).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import { ApiRequestError } from '../services/api.js'
import DraftRequestsPage from './DraftRequestsPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listRequests: vi.fn() }
})

const { listRequests } = await import('../services/api.js')

afterEach(cleanup)

const drafts = [
  { id: 'req-untitled', status: 'draft', core: { title: '', preferredDateTime: '2027-01-15T18:00:00+08:00' } },
  { id: 'req-summit', status: 'draft', core: { title: 'Annual partner summit', preferredDateTime: null } },
]
const submitted = { id: 'req-submitted', status: 'submitted', core: { title: 'A1 submitted' } }

function showDrafts(requests) {
  if (requests) listRequests.mockResolvedValue({ requests })
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Organiser' }, roles: ['organiser'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/drafts']}>
        <Routes>
          <Route path="/requests/drafts" element={<DraftRequestsPage />} />
          <Route path="/event-requests/:id/edit" element={<p>Draft editor</p>} />
          <Route path="/event-requests/new" element={<p>New request form</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-24 — View My Saved Draft Requests', () => {
  it('Lists every draft and nothing that has been submitted', async () => {
    showDrafts([...drafts, submitted])
    expect(await screen.findByText('Annual partner summit')).toBeTruthy()
    expect(screen.queryByText('A1 submitted')).toBeNull()
  })

  it('A draft with no title is still listed, as drafts may be incomplete', async () => {
    showDrafts(drafts)
    expect(await screen.findByText('Untitled draft')).toBeTruthy()
  })

  it('An Organiser with no saved drafts is told so rather than shown a blank page', async () => {
    showDrafts([submitted])
    expect(await screen.findByText('You have no saved drafts')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create an event request' })).toBeTruthy()
  })

  it('Selecting a draft opens it for editing', async () => {
    const user = showDrafts(drafts)
    const links = await screen.findAllByRole('link', { name: 'Continue editing' })
    await user.click(links[0])
    expect(await screen.findByText('Draft editor')).toBeTruthy()
  })

  it('A failed load is reported rather than shown as an empty list', async () => {
    listRequests.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 500 }))
    showDrafts(null)
    expect(await screen.findByText('We could not load your drafts. Please try again.')).toBeTruthy()
  })
})
