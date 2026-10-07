// SPM-49 AC1/AC2/AC3/AC4/AC5/AC6/AC7 — frontend venue catalogue states and display rules.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import VenueCataloguePage from '../../../frontend/src/pages/VenueCataloguePage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listVenues: vi.fn() }
})

const { listVenues } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const venueStaffUser = {
  uid: 'venue-staff-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

function showVenueCataloguePage({ roles = ['venue_staff'], user = venueStaffUser } = {}) {
  render(
    <AuthContext.Provider
      value={{
        user,
        userProfile: { name: 'Venue Staff One' },
        roles,
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={['/venues']}>
        <Routes>
          <Route path="/venues" element={<VenueCataloguePage />} />
          <Route path="/venues/new" element={<p>Add venue page</p>} />
          <Route path="/venues/:id" element={<p>Venue detail page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-49 — venue catalogue frontend', () => {
  it('spm49_frontend_displays_catalogue_venue_information_and_detail_links', async () => {
    listVenues.mockResolvedValue({
      venues: [
        {
          id: 'venue-1',
          name: 'Atrium Hall',
          location: 'Level 1, Main Campus',
          maximumCapacity: 180,
          facilities: ['Reception desk', 'Digital signage'],
          accessibilityFeatures: ['Step-free access'],
          supportedLayouts: ['Banquet', 'Theatre'],
          operatingHours: 'Monday-Saturday 08:00-20:00',
        },
      ],
    })
    const user = showVenueCataloguePage()

    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.getByText('Level 1, Main Campus')).toBeTruthy()
    expect(screen.getByText('180')).toBeTruthy()
    expect(screen.getByText('Banquet, Theatre')).toBeTruthy()
    expect(screen.getByText('Reception desk, Digital signage')).toBeTruthy()
    expect(screen.getByText('Step-free access')).toBeTruthy()
    expect(screen.getByText('Monday-Saturday 08:00-20:00')).toBeTruthy()
    expect(listVenues).toHaveBeenCalledWith(venueStaffUser)

    await user.click(screen.getByRole('link', { name: 'View details' }))
    expect(await screen.findByText('Venue detail page')).toBeTruthy()
  })

  it('spm49_frontend_allows_event_coordinators_to_view_without_add_venue_actions', async () => {
    const coordinatorUser = {
      uid: 'coordinator-1',
      getIdToken: vi.fn().mockResolvedValue('token'),
    }
    listVenues.mockResolvedValue({
      venues: [
        {
          id: 'venue-2',
          name: 'Seminar Room',
          location: 'Level 2',
          maximumCapacity: 35,
          facilities: ['Whiteboard'],
          accessibilityFeatures: ['Lift access'],
          supportedLayouts: ['Classroom'],
          operatingHours: 'Monday-Friday 09:00-17:00',
        },
      ],
    })

    showVenueCataloguePage({ roles: ['coordinator'], user: coordinatorUser })

    expect(await screen.findByRole('heading', { name: 'Seminar Room' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Add venue' })).toBeNull()
    expect(listVenues).toHaveBeenCalledWith(coordinatorUser)
  })

  it('spm49_frontend_shows_not_recorded_for_missing_catalogue_information', async () => {
    listVenues.mockResolvedValue({
      venues: [
        {
          id: 'venue-3',
          name: 'Legacy Venue',
          supportedLayouts: [],
          facilities: [],
          accessibilityFeatures: [],
        },
      ],
    })

    showVenueCataloguePage()

    expect(await screen.findByRole('heading', { name: 'Legacy Venue' })).toBeTruthy()
    expect(screen.getAllByText('Not recorded')).toHaveLength(6)
  })

  it('spm49_frontend_shows_empty_state_when_no_venues_exist', async () => {
    listVenues.mockResolvedValue({ venues: [] })

    showVenueCataloguePage()

    expect(await screen.findByRole('heading', { name: 'No venues yet' })).toBeTruthy()
    expect(screen.getByText('Add the first venue so the catalogue can be used for planning and availability workflows.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Add venue' })).toHaveLength(3)
  })

  it('spm49_frontend_shows_access_error_when_api_rejects_the_catalogue_request', async () => {
    listVenues.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 403 }))

    showVenueCataloguePage()

    expect((await screen.findByRole('alert')).textContent).toBe('You do not have access to the venue catalogue.')
  })
})
