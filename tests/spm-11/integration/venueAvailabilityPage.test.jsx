// SPM-11 AC1/AC2/AC6/AC7 — frontend availability calendar access, status display, and period controls.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getVenueAvailability: vi.fn(),
    listVenues: vi.fn(),
  }
})

const { getVenueAvailability, listVenues } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const venues = [
  { id: 'venue-a', name: 'Atrium Hall' },
  { id: 'venue-b', name: 'Seminar Room' },
]

const availability = {
  range: {
    from: '2026-10-08T08:00:00.000Z',
    to: '2026-10-08T12:00:00.000Z',
  },
  slots: [
    {
      status: AVAILABILITY_STATUS.AVAILABLE,
      startsAt: '2026-10-08T08:00:00.000Z',
      endsAt: '2026-10-08T08:30:00.000Z',
    },
    {
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-10-08T08:30:00.000Z',
      endsAt: '2026-10-08T09:30:00.000Z',
      title: 'Leadership Forum',
    },
    {
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
      startsAt: '2026-10-08T10:00:00.000Z',
      endsAt: '2026-10-08T10:30:00.000Z',
      title: 'Draft networking event',
    },
    {
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      startsAt: '2026-10-08T11:00:00.000Z',
      endsAt: '2026-10-08T12:00:00.000Z',
      title: 'Lighting maintenance',
    },
  ],
}

function showAppAtAvailability({ roles = [COORDINATOR] } = {}) {
  render(
    <AuthContext.Provider
      value={{
        user: { uid: 'user-1', getIdToken: vi.fn().mockResolvedValue('token') },
        userProfile: { name: 'User One' },
        roles,
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={['/venues/venue-a/availability']}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-11 — venue availability frontend', () => {
  it('spm11_frontend_displays_distinct_availability_statuses_for_authorised_users', async () => {
    listVenues.mockResolvedValue({ venues })
    getVenueAvailability.mockResolvedValue({ availability })

    showAppAtAvailability({ roles: [COORDINATOR] })

    expect(await screen.findByRole('heading', { name: 'Venue availability' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.getAllByText('Available')).toHaveLength(2)
    expect(screen.getAllByText('Confirmed booking')).toHaveLength(2)
    expect(screen.getAllByText('Tentative hold')).toHaveLength(2)
    expect(screen.getAllByText('Maintenance block')).toHaveLength(2)
    expect(screen.getByText('Leadership Forum')).toBeTruthy()
    expect(screen.getByText('Draft networking event')).toBeTruthy()
    expect(screen.getByText('Lighting maintenance')).toBeTruthy()
    expect(listVenues).toHaveBeenCalledTimes(1)
    expect(getVenueAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-1' }),
      'venue-a',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    )
  })

  it('spm11_frontend_allows_venue_staff_to_choose_venue_and_move_the_period', async () => {
    listVenues.mockResolvedValue({ venues })
    getVenueAvailability.mockResolvedValue({ availability })
    const user = showAppAtAvailability({ roles: [VENUE_STAFF] })

    await screen.findByRole('heading', { name: 'Atrium Hall' })

    await user.selectOptions(screen.getByLabelText('Venue'), 'venue-b')
    await waitFor(() => {
      expect(getVenueAvailability).toHaveBeenLastCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        'venue-b',
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      )
    })

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-08T08:30' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-08T12:30' } })

    await waitFor(() => {
      expect(getVenueAvailability).toHaveBeenLastCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        'venue-b',
        {
          from: new Date('2026-10-08T08:30').toISOString(),
          to: new Date('2026-10-08T12:30').toISOString(),
        },
      )
    })

    await user.click(screen.getByRole('button', { name: 'Next period' }))
    await waitFor(() => {
      expect(getVenueAvailability).toHaveBeenLastCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        'venue-b',
        {
          from: new Date('2026-10-08T12:30').toISOString(),
          to: new Date('2026-10-08T16:30').toISOString(),
        },
      )
    })
  })

  it('spm11_frontend_denies_other_roles_at_the_availability_route', async () => {
    showAppAtAvailability({ roles: [ORGANISER] })

    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeTruthy()
    expect(listVenues).not.toHaveBeenCalled()
    expect(getVenueAvailability).not.toHaveBeenCalled()
  })
})
