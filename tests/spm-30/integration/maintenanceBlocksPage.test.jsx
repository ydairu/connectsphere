// SPM-30 — frontend maintenance block management from the venue availability page.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { COORDINATOR, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createMaintenanceBlock: vi.fn(),
    getVenueAvailability: vi.fn(),
    listVenues: vi.fn(),
    removeMaintenanceBlock: vi.fn(),
    updateMaintenanceBlock: vi.fn(),
  }
})

const {
  createMaintenanceBlock,
  getVenueAvailability,
  listVenues,
  removeMaintenanceBlock,
  updateMaintenanceBlock,
} = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const venues = [{ id: 'venue-a', name: 'Atrium Hall' }]

const availability = {
  range: {
    from: '2026-10-10T08:00:00.000Z',
    to: '2026-10-10T12:00:00.000Z',
  },
  slots: [
    {
      id: 'block-existing',
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      startsAt: '2026-10-10T10:00:00.000Z',
      endsAt: '2026-10-10T11:00:00.000Z',
      title: 'Planned maintenance',
      reason: 'maintenance',
    },
    {
      status: AVAILABILITY_STATUS.AVAILABLE,
      startsAt: '2026-10-10T11:00:00.000Z',
      endsAt: '2026-10-10T12:00:00.000Z',
    },
  ],
}

function showAvailabilityPage({ roles = [VENUE_STAFF] } = {}) {
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

describe('SPM-30 — maintenance block frontend', () => {
  it('spm30_frontend_allows_venue_staff_to_create_a_maintenance_block', async () => {
    listVenues.mockResolvedValue({ venues })
    getVenueAvailability.mockResolvedValue({ availability })
    createMaintenanceBlock.mockResolvedValue({ block: { id: 'block-new' } })
    const user = showAvailabilityPage()

    expect(await screen.findByRole('heading', { name: 'Block venue period' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-10T13:00' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-10T14:00' } })
    await user.selectOptions(screen.getByLabelText('Reason'), 'renovation')
    await user.click(screen.getByRole('button', { name: 'Create maintenance block' }))

    await waitFor(() => {
      expect(createMaintenanceBlock).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-1' }), 'venue-a', {
        startsAt: new Date('2026-10-10T13:00').toISOString(),
        endsAt: new Date('2026-10-10T14:00').toISOString(),
        reason: 'renovation',
      })
    })
    expect(await screen.findByText('Maintenance block created.')).toBeTruthy()
    expect(getVenueAvailability).toHaveBeenCalledTimes(2)
  })

  it('spm30_frontend_allows_venue_staff_to_amend_and_remove_a_visible_block', async () => {
    listVenues.mockResolvedValue({ venues })
    getVenueAvailability.mockResolvedValue({ availability })
    updateMaintenanceBlock.mockResolvedValue({ block: { id: 'block-existing' } })
    removeMaintenanceBlock.mockResolvedValue({ block: { id: 'block-existing', lifecycleStatus: 'removed' } })
    const user = showAvailabilityPage()

    const slot = await screen.findByText('Planned maintenance')
    const slotRow = slot.closest('li')

    await user.click(within(slotRow).getByRole('button', { name: 'Amend' }))
    expect(screen.getByRole('heading', { name: 'Amend maintenance block' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-10T09:00' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-10T10:00' } })
    await user.selectOptions(screen.getByLabelText('Reason'), 'safety')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(updateMaintenanceBlock).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-1' }), 'venue-a', 'block-existing', {
        startsAt: new Date('2026-10-10T09:00').toISOString(),
        endsAt: new Date('2026-10-10T10:00').toISOString(),
        reason: 'safety',
      })
    })

    await user.click(within(slotRow).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(removeMaintenanceBlock).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user-1' }), 'venue-a', 'block-existing')
    })
    expect(await screen.findByText('Maintenance block removed.')).toBeTruthy()
  })

  it('spm30_frontend_hides_maintenance_block_management_from_coordinators', async () => {
    listVenues.mockResolvedValue({ venues })
    getVenueAvailability.mockResolvedValue({ availability })

    showAvailabilityPage({ roles: [COORDINATOR] })

    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Block venue period' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Amend' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
})
