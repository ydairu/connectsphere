// SPM-6 AC3/AC5/AC6/AC8 — frontend venue creation form validation, feedback, and API handoff.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import CreateVenuePage from '../../../frontend/src/pages/CreateVenuePage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createVenue: vi.fn() }
})

const { createVenue } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const venueStaffUser = {
  uid: 'venue-staff-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

function showCreateVenuePage() {
  render(
    <AuthContext.Provider
      value={{
        user: venueStaffUser,
        userProfile: { name: 'Venue Staff One' },
        roles: ['venue_staff'],
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={['/venues/new']}>
        <CreateVenuePage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function fillValidVenue(user) {
  await user.type(screen.getByLabelText('Venue name'), 'Conference Hall A')
  await user.type(screen.getByLabelText('Physical location'), 'Level 3, Singapore Campus')
  await user.type(screen.getByLabelText('Maximum capacity'), '120')
  await user.type(screen.getByLabelText('Facilities'), 'Projector\nStage\nWi-Fi')
  await user.type(screen.getByLabelText('Accessibility features'), 'Wheelchair access\nAccessible washroom')
  await user.type(screen.getByLabelText('Supported room layouts'), 'Theatre\nClassroom')
  await user.type(screen.getByLabelText('Operating hours'), 'Monday-Friday 09:00-18:00')
}

describe('SPM-6 — Add a Venue to the Catalogue frontend', () => {
  it('spm6_frontend_blocks_empty_save_and_identifies_every_required_field', async () => {
    const user = showCreateVenuePage()

    await user.click(screen.getByRole('button', { name: 'Add venue' }))

    expect(await screen.findByText('Fix the highlighted fields before saving this venue.')).toBeTruthy()
    expect(screen.getAllByText('Required.')).toHaveLength(7)
    expect(createVenue).not.toHaveBeenCalled()
  })

  it('spm6_frontend_submits_valid_venue_details_and_shows_success_feedback', async () => {
    createVenue.mockResolvedValue({
      venue: {
        id: 'venue-1',
        name: 'Conference Hall A',
        maximumCapacity: 120,
      },
    })
    const user = showCreateVenuePage()

    await fillValidVenue(user)
    await user.click(screen.getByRole('button', { name: 'Add venue' }))

    expect(createVenue).toHaveBeenCalledWith(
      venueStaffUser,
      expect.objectContaining({
        name: 'Conference Hall A',
        location: 'Level 3, Singapore Campus',
        maximumCapacity: '120',
        facilities: 'Projector\nStage\nWi-Fi',
        accessibilityFeatures: 'Wheelchair access\nAccessible washroom',
        supportedLayouts: 'Theatre\nClassroom',
        operatingHours: 'Monday-Friday 09:00-18:00',
      }),
    )
    expect(await screen.findByText('Venue added to the catalogue.')).toBeTruthy()
    expect(screen.getByText(/Conference Hall A/)).toBeTruthy()
    expect(screen.getByText(/capacity 120/)).toBeTruthy()
  })

  it('spm6_frontend_displays_backend_validation_errors_without_clearing_entered_data', async () => {
    createVenue.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 400,
        details: {
          message: 'Validation failed',
          errors: {
            maximumCapacity: 'Must be a positive whole number.',
            supportedLayouts: 'Required.',
          },
        },
      }),
    )
    const user = showCreateVenuePage()

    await fillValidVenue(user)
    await user.clear(screen.getByLabelText('Maximum capacity'))
    await user.type(screen.getByLabelText('Maximum capacity'), '9999999999')
    await user.click(screen.getByRole('button', { name: 'Add venue' }))

    expect(await screen.findByText('Must be a positive whole number.')).toBeTruthy()
    expect(screen.getByText('Required.')).toBeTruthy()
    expect(screen.getByDisplayValue('Conference Hall A')).toBeTruthy()
    expect(screen.getByLabelText('Facilities').value).toBe('Projector\nStage\nWi-Fi')
  })
})
