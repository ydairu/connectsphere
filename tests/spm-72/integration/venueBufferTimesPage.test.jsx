// SPM-72 — setup and turnaround times on the add, edit and venue detail pages.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { COORDINATOR, VENUE_STAFF } from '../../../shared/permissions.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import CreateVenuePage from '../../../frontend/src/pages/CreateVenuePage.jsx'
import EditVenuePage from '../../../frontend/src/pages/EditVenuePage.jsx'
import VenueDetailPage from '../../../frontend/src/pages/VenueDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createVenue: vi.fn(), getVenue: vi.fn(), updateVenue: vi.fn() }
})

const { createVenue, getVenue, updateVenue } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const signedInUser = {
  uid: 'venue-staff-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

const savedVenue = Object.freeze({
  id: 'venue-1',
  name: 'Atrium Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 180,
  facilities: ['Projector'],
  accessibilityFeatures: ['Step-free access'],
  supportedLayouts: ['Theatre'],
  operatingHours: 'Monday-Saturday 08:00-20:00',
  setupMinutes: 30,
  turnaroundMinutes: 45,
  bufferTimesLocked: false,
})

function showPage(path, { roles = [VENUE_STAFF] } = {}) {
  render(
    <AuthContext.Provider value={{ user: signedInUser, userProfile: { name: 'Venue Staff One' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/venues/new" element={<CreateVenuePage />} />
          <Route path="/venues/:id/edit" element={<EditVenuePage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function fillCatalogueDetails(user) {
  await user.type(screen.getByLabelText('Venue name'), 'Conference Hall A')
  await user.type(screen.getByLabelText('Physical location'), 'Level 3, Main Campus')
  await user.type(screen.getByLabelText('Maximum capacity'), '120')
  await user.type(screen.getByLabelText('Facilities'), 'Projector')
  await user.type(screen.getByLabelText('Accessibility features'), 'Wheelchair access')
  await user.type(screen.getByLabelText('Supported room layouts'), 'Theatre')
  await user.type(screen.getByLabelText('Operating hours'), 'Monday-Friday 09:00-18:00')
}

describe('SPM-72 — add venue page', () => {
  it('spm72_frontend_add_page_starts_both_times_at_zero_and_sends_the_entered_minutes', async () => {
    createVenue.mockResolvedValue({ venue: { ...savedVenue, id: 'venue-new' } })
    const user = showPage('/venues/new')

    expect(screen.getByLabelText('Setup time (minutes)').value).toBe('0')
    expect(screen.getByLabelText('Turnaround time (minutes)').value).toBe('0')

    await fillCatalogueDetails(user)
    await user.clear(screen.getByLabelText('Setup time (minutes)'))
    await user.type(screen.getByLabelText('Setup time (minutes)'), '30')
    await user.clear(screen.getByLabelText('Turnaround time (minutes)'))
    await user.type(screen.getByLabelText('Turnaround time (minutes)'), '45')
    await user.click(screen.getByRole('button', { name: 'Add venue' }))

    await waitFor(() => {
      expect(createVenue).toHaveBeenCalledWith(
        signedInUser,
        expect.objectContaining({ name: 'Conference Hall A', setupMinutes: '30', turnaroundMinutes: '45' }),
      )
    })
  })

  it('spm72_frontend_add_page_blocks_negative_or_blank_times_and_names_the_field', async () => {
    const user = showPage('/venues/new')

    await fillCatalogueDetails(user)
    await user.clear(screen.getByLabelText('Setup time (minutes)'))
    await user.clear(screen.getByLabelText('Turnaround time (minutes)'))
    await user.type(screen.getByLabelText('Turnaround time (minutes)'), '-10')
    await user.click(screen.getByRole('button', { name: 'Add venue' }))

    expect(screen.getByText('Required. Enter 0 if none is needed.')).toBeTruthy()
    expect(screen.getByText('Must be a whole number of minutes, 0 or more.')).toBeTruthy()
    expect(screen.getByLabelText('Turnaround time (minutes)').getAttribute('aria-invalid')).toBe('true')
    expect(createVenue).not.toHaveBeenCalled()
  })
})

describe('SPM-72 — edit venue page', () => {
  it('spm72_frontend_edit_page_shows_saved_times_and_sends_changed_minutes', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    updateVenue.mockResolvedValue({ venue: { ...savedVenue, setupMinutes: 60 } })
    const user = showPage('/venues/venue-1/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Atrium Hall' })).toBeTruthy()
    expect(screen.getByLabelText('Setup time (minutes)').value).toBe('30')
    expect(screen.getByLabelText('Turnaround time (minutes)').value).toBe('45')

    await user.clear(screen.getByLabelText('Setup time (minutes)'))
    await user.type(screen.getByLabelText('Setup time (minutes)'), '60')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(updateVenue).toHaveBeenCalledWith(
        signedInUser,
        'venue-1',
        expect.objectContaining({ location: 'Level 1, Main Campus', setupMinutes: '60', turnaroundMinutes: '45' }),
      )
    })
  })

  it('spm72_frontend_edit_page_shows_zero_for_a_venue_without_stored_times', async () => {
    const olderVenue = { ...savedVenue }
    delete olderVenue.setupMinutes
    delete olderVenue.turnaroundMinutes
    getVenue.mockResolvedValue({ venue: olderVenue })
    showPage('/venues/venue-1/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Atrium Hall' })).toBeTruthy()
    expect(screen.getByLabelText('Setup time (minutes)').value).toBe('0')
    expect(screen.getByLabelText('Turnaround time (minutes)').value).toBe('0')
  })

  it('spm72_frontend_edit_page_makes_the_times_read_only_while_a_confirmed_booking_exists', async () => {
    getVenue.mockResolvedValue({ venue: { ...savedVenue, bufferTimesLocked: true } })
    updateVenue.mockResolvedValue({ venue: savedVenue })
    const user = showPage('/venues/venue-1/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Atrium Hall' })).toBeTruthy()
    expect(screen.getByText('Setup and turnaround times cannot be changed while this venue has a confirmed booking.')).toBeTruthy()
    expect(screen.getByLabelText('Setup time (minutes)').readOnly).toBe(true)
    expect(screen.getByLabelText('Turnaround time (minutes)').readOnly).toBe(true)

    await user.clear(screen.getByLabelText('Physical location'))
    await user.type(screen.getByLabelText('Physical location'), 'Level 2, Main Campus')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateVenue).toHaveBeenCalled())
    const payload = updateVenue.mock.calls[0][2]
    expect(payload.location).toBe('Level 2, Main Campus')
    expect(payload).not.toHaveProperty('setupMinutes')
    expect(payload).not.toHaveProperty('turnaroundMinutes')
  })

  it('spm72_frontend_edit_page_locks_and_resets_the_times_when_the_server_refuses_them', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    updateVenue.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 409,
        details: {
          message: 'Setup and turnaround times are locked by a confirmed booking',
          errors: { setupMinutes: 'Setup time cannot be changed while this venue has a confirmed booking.' },
        },
      }),
    )
    const user = showPage('/venues/venue-1/edit')

    expect(await screen.findByRole('heading', { name: 'Edit Atrium Hall' })).toBeTruthy()
    await user.clear(screen.getByLabelText('Setup time (minutes)'))
    await user.type(screen.getByLabelText('Setup time (minutes)'), '90')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'This venue now has a confirmed booking, so its setup and turnaround times are locked. Nothing was saved. Save again to keep your other changes.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Setup time cannot be changed while this venue has a confirmed booking.')).toBeTruthy()
    expect(screen.getByLabelText('Setup time (minutes)').value).toBe('30')
    expect(screen.getByLabelText('Setup time (minutes)').readOnly).toBe(true)
  })
})

describe('SPM-72 — venue detail page', () => {
  it('spm72_frontend_detail_page_shows_setup_and_turnaround_times', async () => {
    getVenue.mockResolvedValue({ venue: savedVenue })
    showPage('/venues/venue-1', { roles: [COORDINATOR] })

    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.getByText('Setup time').nextSibling.textContent).toBe('30 minutes')
    expect(screen.getByText('Turnaround time').nextSibling.textContent).toBe('45 minutes')
  })

  it('spm72_frontend_detail_page_shows_zero_minutes_and_the_lock_note_to_venue_staff', async () => {
    getVenue.mockResolvedValue({
      venue: { ...savedVenue, setupMinutes: 0, turnaroundMinutes: 1, bufferTimesLocked: true },
    })
    showPage('/venues/venue-1')

    expect(await screen.findByRole('heading', { name: 'Atrium Hall' })).toBeTruthy()
    expect(screen.getByText('Setup time').nextSibling.textContent).toBe('0 minutes')
    expect(screen.getByText('Turnaround time').nextSibling.textContent).toBe('1 minute')
    expect(screen.getByText('Setup and turnaround times are locked while this venue has a confirmed booking.')).toBeTruthy()
  })
})
