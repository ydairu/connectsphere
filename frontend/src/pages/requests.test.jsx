// SPM-24 #5 and SPM-42 view side — the requests page. One page, one code path; the API decides the
// records and sections, and the role decides only the wording.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import RequestsPage from './RequestsPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listRequests: vi.fn() }
})

const { listRequests } = await import('../services/api.js')

afterEach(cleanup)

const requests = [
  { id: 'req-returned', status: 'returned_for_clarification', core: { title: 'A1 returned' } },
  { id: 'req-draft', status: 'draft', core: { title: 'A1 draft' } },
  { id: 'req-confirmed', status: 'confirmed', core: { title: 'A1 confirmed' }, organisationName: 'Seed Organisation A' },
]

function showRequests(roles, list = requests) {
  listRequests.mockResolvedValue({ requests: list })
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Tester' }, roles, loading: false }}>
      <MemoryRouter initialEntries={['/requests']}>
        <Routes>
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<p>Request detail</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SPM-24 #5 — submitted requests are shown with their status, not as drafts', () => {
  it('Shows each request with its status label and no editing', async () => {
    showRequests(['organiser'])
    expect(await screen.findByText('Returned for clarification')).toBeTruthy()
    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('Leaves drafts to the drafts page', async () => {
    showRequests(['organiser'])
    expect(await screen.findByText('A1 confirmed')).toBeTruthy()
    expect(screen.queryByText('A1 draft')).toBeNull()
  })

  it('Each request opens its detail page', async () => {
    showRequests(['organiser'])
    const view = await screen.findAllByRole('link', { name: 'View' })
    expect(view.length).toBe(2)
  })
})

describe('SPM-42 — the same page, worded for the role', () => {
  it('A coordinator sees the system-wide heading', async () => {
    showRequests(['coordinator'])
    expect(await screen.findByRole('heading', { name: 'All event requests' })).toBeTruthy()
  })

  it('Staff see assigned work, and the venue+technical account sees one heading', async () => {
    showRequests(['venue_staff', 'technical_staff'])
    expect(await screen.findByRole('heading', { name: 'Events assigned to you' })).toBeTruthy()
  })

  it('Staff with nothing assigned are told so', async () => {
    showRequests(['venue_staff'], [])
    expect(await screen.findByText('Nothing assigned to you yet')).toBeTruthy()
  })

  it('An attendee sees the events wording', async () => {
    showRequests(['attendee'])
    expect(await screen.findByRole('heading', { name: 'Events open to you' })).toBeTruthy()
  })
})
