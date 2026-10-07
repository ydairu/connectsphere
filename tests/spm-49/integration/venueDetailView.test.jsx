// SPM-49 AC2/AC3 — venue detail view displays all layouts and marks missing fields as Not recorded.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import VenueDetailPage from '../../../frontend/src/pages/VenueDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getVenue: vi.fn() }
})

const { getVenue } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function showVenueDetailPage({ roles = ['coordinator'] } = {}) {
  render(
    <AuthContext.Provider
      value={{
        user: { uid: 'coordinator-1', getIdToken: vi.fn().mockResolvedValue('token') },
        userProfile: { name: 'Coordinator One' },
        roles,
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={['/venues/venue-1']}>
        <Routes>
          <Route path="/venues" element={<p>Venue catalogue page</p>} />
          <Route path="/venues/new" element={<p>Add venue page</p>} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SPM-49 — venue detail frontend', () => {
  it('spm49_frontend_displays_all_recorded_room_layouts_when_viewing_details', async () => {
    getVenue.mockResolvedValue({
      venue: {
        id: 'venue-1',
        name: 'Atrium Hall',
        location: 'Level 1',
        maximumCapacity: 180,
        facilities: ['Reception desk'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['Banquet', 'Theatre', 'Classroom'],
        operatingHours: 'Monday-Saturday 08:00-20:00',
      },
    })

    showVenueDetailPage()

    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.getByText('Banquet')).toBeTruthy()
    expect(screen.getByText('Theatre')).toBeTruthy()
    expect(screen.getByText('Classroom')).toBeTruthy()
    expect(screen.queryByText('Added by')).toBeNull()
  })

  it('spm49_frontend_displays_not_recorded_for_missing_detail_fields', async () => {
    getVenue.mockResolvedValue({
      venue: {
        id: 'venue-1',
        name: 'Legacy Venue',
        supportedLayouts: [],
        facilities: [],
        accessibilityFeatures: [],
      },
    })

    showVenueDetailPage()

    expect(await screen.findByRole('heading', { name: 'Legacy Venue' })).toBeTruthy()
    expect(screen.getAllByText('Not recorded')).toHaveLength(6)
  })
})
