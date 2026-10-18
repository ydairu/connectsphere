// SPM-13, presentation side: the Venue suitability card on the booking recommendations tab. The API is mocked here;
// the rules and their enforcement are covered by the unit and API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { PLANNING } from '../../../shared/status.js'
import { SUITABLE, SUITABLE_WITH_WARNINGS, UNSUITABLE } from '../../../shared/venueSuitability.js'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import { ApiRequestError } from '../../../frontend/src/services/api.js'
import VenueBookingsPage from '../../../frontend/src/pages/VenueBookingsPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), getVenueBookings: vi.fn(), getVenueSuitability: vi.fn(), updateRequest: vi.fn(), getRequestHistory: vi.fn() }
})

const { getRequest, getVenueBookings, getVenueSuitability, updateRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const coordinatorUser = { uid: 'seed-coordinator' }

function requestResponse({ venue = {}, canCheckVenueSuitability = true } = {}) {
  return {
    request: {
      id: 'req-1',
      status: PLANNING,
      core: { title: 'Partner summit', expectedAttendees: 80 },
      venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Two wheelchair users', ...venue },
    },
    editableSections: ['core', 'venue'],
    availableActions: [],
    canCheckVenueSuitability,
  }
}

function suitabilityResponse({ requiredFacilities = [], requiredAccessibilityFeatures = [], venues } = {}) {
  return {
    event: {
      period: { label: 'Fri 20 Nov 2026, 09:00–13:00' },
      expectedAttendees: 80,
      layoutPreference: 'theatre',
      accessibilityRequired: true,
      accessibilityNeeds: 'Two wheelchair users',
      requiredFacilities,
      requiredAccessibilityFeatures,
    },
    venues: venues ?? [
      { id: 'atrium', name: 'Atrium Hall', location: 'Main Campus', maximumCapacity: 100, result: SUITABLE, problems: [], warnings: [] },
      {
        id: 'studio',
        name: 'Studio',
        location: 'East Wing',
        maximumCapacity: 90,
        result: SUITABLE_WITH_WARNINGS,
        problems: [],
        warnings: [{ check: 'layout', message: 'Layout "theatre" is not supported by this venue (supported: Banquet).' }],
      },
      {
        id: 'small',
        name: 'Small Room',
        location: 'Main Campus',
        maximumCapacity: 40,
        result: UNSUITABLE,
        problems: [
          { check: 'capacity', message: "Expected attendance (80) is above this venue's capacity (40)." },
          { check: 'facilities', message: 'Missing required facility: Mic system.' },
        ],
        warnings: [{ check: 'operatingHours', message: "The event is outside this venue's operating hours (Saturday 09:00-12:00)." }],
      },
    ],
    options: { facilities: ['Mic system', 'Projector'], accessibilityFeatures: ['Hearing loop', 'Wheelchair access'] },
  }
}

function showRequest(response = requestResponse()) {
  getRequest.mockResolvedValue(response)
  getVenueBookings.mockResolvedValue({ event: response.request, canSubmit: false, bookings: [] })
  render(
    <AuthContext.Provider value={{ user: coordinatorUser, userProfile: { name: 'Seed Coordinator' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1/venue-bookings?tab=recommendations']}>
        <Routes>
          <Route path="/requests/:id/venue-bookings" element={<VenueBookingsPage />} />
          <Route path="/venues/:id" element={<p>Venue detail page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function suitabilityCard() {
  const heading = await screen.findByRole('heading', { name: 'Venue suitability' })
  return heading.closest('.venue-suitability')
}

// The requirement options arrive with the suitability results, so wait for those before ticking.
async function loadedSuitabilityCard() {
  const card = await suitabilityCard()
  await within(card).findByRole('list', { name: 'Venue suitability results' })
  return card
}

describe('SPM-13 — Venue suitability on booking recommendations', () => {
  it('spm13_frontend_shows_the_card_only_when_the_api_allows_it', async () => {
    showRequest(requestResponse({ canCheckVenueSuitability: false }))

    expect(await screen.findByRole('heading', { name: 'Venue booking requests' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Venue suitability' })).toBeNull()
    expect(getVenueSuitability).not.toHaveBeenCalled()
  })

  it('spm13_frontend_shows_each_venue_as_suitable_with_warnings_or_unsuitable_and_names_every_reason', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const card = await suitabilityCard()

    const results = await within(card).findByRole('list', { name: 'Venue suitability results' })
    const items = within(results).getAllByRole('listitem').filter((item) => item.classList.contains('suitability-item'))
    expect(items.map((item) => [within(item).getByRole('heading').textContent, item.querySelector('.suitability-badge').textContent])).toEqual([
      ['Atrium Hall', 'Suitable'],
      ['Studio', 'Suitable with warnings'],
      ['Small Room', 'Unsuitable'],
    ])
    expect(within(items[2]).getByText("Expected attendance (80) is above this venue's capacity (40).")).toBeTruthy()
    expect(within(items[2]).getByText('Missing required facility: Mic system.')).toBeTruthy()
    expect(within(items[2]).getByText("The event is outside this venue's operating hours (Saturday 09:00-12:00).")).toBeTruthy()
    expect(within(items[1]).getByText('Layout "theatre" is not supported by this venue (supported: Banquet).')).toBeTruthy()
    expect(within(card).getByText('Checked against: 80 expected attendees · Fri 20 Nov 2026, 09:00–13:00 · theatre layout')).toBeTruthy()
    expect(getVenueSuitability).toHaveBeenCalledWith(coordinatorUser, 'req-1')
  })

  it('spm13_frontend_offers_catalogue_values_as_requirements_and_keeps_them_out_of_the_venue_form', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const card = await loadedSuitabilityCard()

    const facilities = within(card).getByRole('group', { name: 'Required facilities' })
    expect(within(facilities).getAllByRole('checkbox').map((box) => box.labels[0].textContent)).toEqual(['Mic system', 'Projector'])
    const accessibility = within(card).getByRole('group', { name: 'Required accessibility features' })
    expect(within(accessibility).getAllByRole('checkbox').map((box) => box.labels[0].textContent)).toEqual(['Hearing loop', 'Wheelchair access'])
    expect(screen.queryByRole('textbox', { name: /Required facilities/ })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Save requirements' }).disabled).toBe(true)
  })

  it('spm13_frontend_prompts_for_accessibility_features_when_the_organiser_needs_accessibility', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    showRequest()
    const card = await suitabilityCard()

    expect(
      await within(card).findByText(
        'The Organiser says accessibility is required: Two wheelchair users. Tick the accessibility features to check venues for.',
      ),
    ).toBeTruthy()
  })

  it('spm13_frontend_saves_only_the_changed_requirements_and_checks_again', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    updateRequest.mockResolvedValue(requestResponse({ venue: { requiredFacilities: ['Mic system'] } }))
    const user = showRequest()
    const card = await loadedSuitabilityCard()

    await user.click(within(card).getByRole('checkbox', { name: 'Mic system' }))
    await user.click(within(card).getByRole('button', { name: 'Save requirements' }))

    await waitFor(() => {
      expect(updateRequest).toHaveBeenCalledWith(coordinatorUser, 'req-1', { venue: { requiredFacilities: ['Mic system'] } })
    })
    expect(await within(card).findByText('Venue requirements saved. Suitability has been checked again.')).toBeTruthy()
    await waitFor(() => expect(getVenueSuitability).toHaveBeenCalledTimes(2))
    expect(within(card).getByRole('checkbox', { name: 'Mic system' }).checked).toBe(true)
  })

  it('spm13_frontend_keeps_a_saved_requirement_that_is_no_longer_in_the_catalogue_so_it_can_be_unticked', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse({ requiredFacilities: ['Stage'] }))
    showRequest(requestResponse({ venue: { requiredFacilities: ['Stage'] } }))
    const card = await suitabilityCard()

    expect(within(card).getByRole('checkbox', { name: 'Stage' }).checked).toBe(true)
  })

  it('spm13_frontend_shows_when_the_check_cannot_be_loaded', async () => {
    getVenueSuitability.mockRejectedValue(new ApiRequestError('API_REQUEST_FAILED', { status: 500 }))
    showRequest()
    const card = await suitabilityCard()

    expect(await within(card).findByText('We could not check venue suitability. Please try again.')).toBeTruthy()
  })

  it('spm13_frontend_shows_why_saving_requirements_was_refused', async () => {
    getVenueSuitability.mockResolvedValue(suitabilityResponse())
    updateRequest.mockRejectedValue(
      new ApiRequestError('API_REQUEST_FAILED', {
        status: 400,
        details: { errors: { 'venue.requiredFacilities': 'Must contain only text values.' } },
      }),
    )
    const user = showRequest()
    const card = await loadedSuitabilityCard()

    await user.click(within(card).getByRole('checkbox', { name: 'Mic system' }))
    await user.click(within(card).getByRole('button', { name: 'Save requirements' }))
    expect(await within(card).findByText('Must contain only text values.')).toBeTruthy()
  })

  it('spm13_frontend_says_when_the_catalogue_has_no_venues', async () => {
    getVenueSuitability.mockResolvedValue({ ...suitabilityResponse(), venues: [], options: { facilities: [], accessibilityFeatures: [] } })
    showRequest()
    const card = await suitabilityCard()

    expect(await within(card).findByText('No venues are recorded in the venue catalogue yet.')).toBeTruthy()
    expect(within(card).getByText('No facilities are recorded in the venue catalogue yet.')).toBeTruthy()
  })
})
