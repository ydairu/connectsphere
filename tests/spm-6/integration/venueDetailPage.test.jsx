// SPM-6 AC4/AC9 — frontend reopen view displays every saved venue catalogue field.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
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

const venueStaffUser = {
  uid: 'venue-staff-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

function showVenueDetailPage({ initialEntries = ['/venues/venue-1'] } = {}) {
  render(
    <AuthContext.Provider
      value={{
        user: venueStaffUser,
        userProfile: { name: 'Venue Staff One' },
        roles: ['venue_staff'],
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/venues/:id" element={<VenueDetailPage />} />
          <Route path="/venues/new" element={<p>Add another venue</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SPM-6 — venue detail reopen view', () => {
  it('spm6_frontend_reopens_a_saved_venue_and_displays_all_saved_information', async () => {
    getVenue.mockResolvedValue({
      venue: {
        id: 'venue-1',
        name: 'Conference Hall A',
        location: 'Level 3, Singapore Campus',
        maximumCapacity: 120,
        facilities: ['Projector', 'Stage', 'Wi-Fi'],
        accessibilityFeatures: ['Wheelchair access', 'Accessible washroom'],
        supportedLayouts: ['Theatre', 'Classroom'],
        operatingHours: 'Monday-Friday 09:00-18:00',
        createdByName: 'Venue Staff One',
      },
    })

    showVenueDetailPage()

    expect(await screen.findByRole('heading', { name: 'Conference Hall A' })).toBeTruthy()
    expect(screen.queryByText(/Catalogue reference/)).toBeNull()
    expect(screen.queryByText('venue-1')).toBeNull()
    expect(screen.getByText('Level 3, Singapore Campus')).toBeTruthy()
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('Projector')).toBeTruthy()
    expect(screen.getByText('Stage')).toBeTruthy()
    expect(screen.getByText('Wi-Fi')).toBeTruthy()
    expect(screen.getByText('Wheelchair access')).toBeTruthy()
    expect(screen.getByText('Accessible washroom')).toBeTruthy()
    expect(screen.getByText('Theatre')).toBeTruthy()
    expect(screen.getByText('Classroom')).toBeTruthy()
    expect(screen.getByText('Monday-Friday 09:00-18:00')).toBeTruthy()
    expect(screen.getByText('Venue Staff One')).toBeTruthy()
  })

  it('spm6_frontend_reports_missing_venue_when_reopen_fails', async () => {
    getVenue.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 404 }))

    showVenueDetailPage()

    expect(await screen.findByText('This venue no longer exists.')).toBeTruthy()
  })
})
