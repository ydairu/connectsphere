// SPM-64 follow-up (AC4/AC6), presentation side: an Organiser's requests list says who submitted each
// request and can be narrowed to their own; a colleague's request page says whose it is and that it is
// view-only. Other roles see none of it. The API is mocked here; requestOwnerApi.test.js covers the fields.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import RequestsPage from '../../../frontend/src/pages/RequestsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listRequests: vi.fn(), getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, listRequests } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const NOTE = /This request was submitted by .* from your organisation\. You can view it but not edit it\./

const item = (id, title, owner, status = 'submitted') => ({ id, status, core: { title }, organisationName: 'Seed Organisation A', ...owner })
const MINE = { ownerName: 'Seed Organiser A1', isOwnRequest: true }
const COLLEAGUE = { ownerName: 'Seed Organiser A2', isOwnRequest: false }

const ORGANISER_LIST = [
  item('r1', 'My summit', MINE),
  item('r2', 'Colleague launch', COLLEAGUE),
  item('r3', 'My closed event', MINE, 'completed'),
]

function renderAs(roles, path) {
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'User' }, roles, loading: false }}>
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

const showList = (requests, roles = ['organiser']) => {
  listRequests.mockResolvedValue({ requests })
  return renderAs(roles, '/requests')
}

const card = (title) => screen.getByRole('heading', { name: title }).closest('.request-item')

describe('SPM-64 follow-up — requests list', () => {
  it('labels own requests "You" and a colleague\'s request with their name', async () => {
    showList(ORGANISER_LIST)
    await screen.findByRole('heading', { name: 'My summit' })
    expect(within(card('My summit')).getByText('Submitted by: You')).toBeTruthy()
    expect(within(card('Colleague launch')).getByText('Submitted by: Seed Organiser A2')).toBeTruthy()
    expect(within(card('My closed event')).getByText('Submitted by: You')).toBeTruthy()
  })

  it('"All" (the default) shows own and colleague requests; "My requests" only own ones', async () => {
    const user = showList(ORGANISER_LIST)
    await screen.findByRole('heading', { name: 'My summit' })
    const filter = screen.getByRole('group', { name: 'Show' })
    expect(within(filter).getByRole('radio', { name: 'All' }).checked).toBe(true)
    expect(screen.getByRole('heading', { name: 'Colleague launch' })).toBeTruthy()

    await user.click(within(filter).getByRole('radio', { name: 'My requests' }))
    expect(screen.queryByRole('heading', { name: 'Colleague launch' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'My summit' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'My closed event' })).toBeTruthy()

    await user.click(within(filter).getByRole('radio', { name: 'All' }))
    expect(screen.getByRole('heading', { name: 'Colleague launch' })).toBeTruthy()
  })

  it('"My requests" with nothing of their own shows the empty state', async () => {
    const user = showList([item('r2', 'Colleague launch', COLLEAGUE)])
    await screen.findByRole('heading', { name: 'Colleague launch' })
    expect(screen.queryByText("You haven't submitted any requests yet.")).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'My requests' }))
    expect(screen.getByText("You haven't submitted any requests yet.")).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Colleague launch' })).toBeNull()
  })

  it('a colleague whose name is unavailable is labelled "A colleague"', async () => {
    showList([item('r2', 'Colleague launch', { ownerName: null, isOwnRequest: false })])
    await screen.findByRole('heading', { name: 'Colleague launch' })
    expect(within(card('Colleague launch')).getByText('Submitted by: A colleague')).toBeTruthy()
  })

  it.each([['coordinator'], ['venue_staff'], ['technical_staff'], ['attendee']])('%s: no filter and no label', async (role) => {
    showList([item('r1', 'Assigned event', {})], [role])
    await screen.findByRole('heading', { name: 'Assigned event' })
    expect(screen.queryByRole('group', { name: 'Show' })).toBeNull()
    expect(screen.queryByText(/Submitted by:/)).toBeNull()
  })

  it('other roles get no label even if a response carried the fields', async () => {
    showList([item('r1', 'Assigned event', COLLEAGUE)], ['coordinator'])
    await screen.findByRole('heading', { name: 'Assigned event' })
    expect(screen.queryByText(/Submitted by:/)).toBeNull()
  })
})

describe('SPM-64 follow-up — request page note', () => {
  const detail = (owner) => ({
    request: { id: 'r2', status: 'submitted', core: { title: 'Colleague launch' } },
    editableSections: [],
    availableActions: [],
    ...owner,
  })

  it('a colleague\'s request says whose it is and that it is view-only', async () => {
    getRequest.mockResolvedValue(detail(COLLEAGUE))
    renderAs(['organiser'], '/requests/r2')
    const note = await screen.findByRole('note')
    expect(note.textContent).toBe('This request was submitted by Seed Organiser A2 from your organisation. You can view it but not edit it.')
  })

  it('an own request has no note', async () => {
    getRequest.mockResolvedValue(detail(MINE))
    renderAs(['organiser'], '/requests/r2')
    await screen.findByRole('heading', { name: 'Colleague launch' })
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it.each([['coordinator'], ['venue_staff'], ['attendee']])('%s: no note', async (role) => {
    getRequest.mockResolvedValue(detail({}))
    renderAs([role], '/requests/r2')
    await screen.findByRole('heading', { name: 'Colleague launch' })
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})
