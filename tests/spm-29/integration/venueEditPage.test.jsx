// SPM-29 AC1/AC2/AC3/AC4/AC7/AC8 — Venue Staff edit form load, save, cancel, and error states.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import EditVenuePage from '../../../frontend/src/pages/EditVenuePage.jsx'
import { ApiRequestError } from '../../../frontend/src/services/api.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getVenue: vi.fn(), updateVenue: vi.fn() }
})

const { getVenue, updateVenue } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const venueStaffUser = {
  uid: 'venue-staff-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

const savedVenue = Object.freeze({
  id: 'venue-1',
  name: 'Atrium Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 180,
  facilities: ['Reception desk', 'Digital signage'],
  accessibilityFeatures: ['Step-free access'],
  supportedLayouts: ['Banquet', 'Theatre'],
  operatingHours: 'Monday-Saturday 08:00-20:00',
})

function showEditVenuePage() {
  render(
    <AuthContext.Provider
      value={{
        user: venueStaffUser,
        userProfile: { name: 'Venue Staff One' },
        roles: ['venue_staff'],
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={['/venues/venue-1/edit']}>
        <Routes>
          <Route path="/venues/:id/edit" element={<EditVenuePage />} />
          <Route path="/venues/:id" element={<p>Venue detail page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-29 — Edit venue frontend', () => {
  it('spm29_frontend_prefills_saved_venue_details_for_editing', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })

    showEditVenuePage()

    expect(await screen.findByRole('heading', { name: 'Edit Atrium Hall' })).toBeTruthy()
    expect(screen.getByLabelText('Venue name').value).toBe('Atrium Hall')
    expect(screen.getByLabelText('Physical location').value).toBe('Level 1, Main Campus')
    expect(screen.getByLabelText('Maximum capacity').value).toBe('180')
    expect(screen.getByLabelText('Facilities').value).toBe('Reception desk\nDigital signage')
    expect(screen.getByLabelText('Supported room layouts').value).toBe('Banquet\nTheatre')
  })

  it('spm29_frontend_saves_valid_changes_and_returns_to_detail_page', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    updateVenue.mockResolvedValue({ venue: { ...savedVenue, location: 'Level 2, Main Campus' } })
    const user = showEditVenuePage()

    const location = await screen.findByLabelText('Physical location')
    await user.clear(location)
    await user.type(location, 'Level 2, Main Campus')
    await user.clear(screen.getByLabelText('Maximum capacity'))
    await user.type(screen.getByLabelText('Maximum capacity'), '220')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(updateVenue).toHaveBeenCalledWith(
        venueStaffUser,
        'venue-1',
        expect.objectContaining({
          location: 'Level 2, Main Campus',
          maximumCapacity: '220',
          facilities: 'Reception desk\nDigital signage',
          accessibilityFeatures: 'Step-free access',
          supportedLayouts: 'Banquet\nTheatre',
          operatingHours: 'Monday-Saturday 08:00-20:00',
        }),
      )
    })
    expect(await screen.findByText('Venue detail page')).toBeTruthy()
  })

  it('spm29_frontend_blocks_invalid_changes_and_keeps_entered_values', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    const user = showEditVenuePage()

    await screen.findByRole('heading', { name: 'Edit Atrium Hall' })
    await user.clear(screen.getByLabelText('Maximum capacity'))
    await user.type(screen.getByLabelText('Maximum capacity'), '0')
    await user.clear(screen.getByLabelText('Supported room layouts'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Fix the highlighted fields before saving this venue.')).toBeTruthy()
    expect(screen.getByText('Must be a positive whole number.')).toBeTruthy()
    expect(screen.getByText('Required.')).toBeTruthy()
    expect(screen.getByLabelText('Maximum capacity').value).toBe('0')
    expect(updateVenue).not.toHaveBeenCalled()
  })

  it('spm29_frontend_shows_system_failure_without_false_success', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    updateVenue.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 500 }))
    const user = showEditVenuePage()

    await screen.findByRole('heading', { name: 'Edit Atrium Hall' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Could not update the venue. No changes were saved. Please try again.')).toBeTruthy()
    expect(screen.queryByText('Venue detail page')).toBeNull()
  })

  it('spm29_frontend_cancel_returns_without_saving', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    const user = showEditVenuePage()

    await screen.findByRole('heading', { name: 'Edit Atrium Hall' })
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(updateVenue).not.toHaveBeenCalled()
    expect(await screen.findByText('Venue detail page')).toBeTruthy()
  })
})
