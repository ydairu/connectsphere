// SPM-12 — frontend venue search by event requirements on the venue catalogue page, and the query the
// API client builds from it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { COORDINATOR } from '../../../shared/permissions.js'
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
  vi.unstubAllGlobals()
})

const coordinatorUser = {
  uid: 'coordinator-1',
  getIdToken: vi.fn().mockResolvedValue('token'),
}

const grandHall = {
  id: 'grand-hall',
  name: 'Grand Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 300,
  facilities: ['Projector', 'Mic system'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Theatre', 'Banquet'],
  operatingHours: 'Monday-Saturday 08:00-20:00',
}

const lectureRoom = {
  id: 'lecture-room',
  name: 'Lecture Room',
  location: 'Level 2, Main Campus',
  maximumCapacity: 120,
  facilities: ['Projector'],
  accessibilityFeatures: ['Step-free entrance'],
  supportedLayouts: ['Classroom'],
  operatingHours: 'Monday-Friday 09:00-17:00',
}

const filterOptions = {
  locations: ['Level 1, Main Campus', 'Level 2, Main Campus'],
  layouts: ['Banquet', 'Classroom', 'Theatre'],
  facilities: ['Mic system', 'Projector'],
  accessibilityFeatures: ['Step-free entrance', 'Wheelchair access'],
}

function showVenueCataloguePage() {
  render(
    <AuthContext.Provider value={{ user: coordinatorUser, userProfile: { name: 'Coordinator One' }, roles: [COORDINATOR], loading: false }}>
      <MemoryRouter initialEntries={['/venues']}>
        <Routes>
          <Route path="/venues" element={<VenueCataloguePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function showLoadedCatalogue() {
  const user = showVenueCataloguePage()
  expect(await screen.findByRole('heading', { name: 'Grand Hall' })).toBeTruthy()
  return user
}

describe('SPM-12 — venue search page', () => {
  it('spm12_frontend_offers_the_filter_values_recorded_in_the_catalogue', async () => {
    listVenues.mockResolvedValue({ venues: [grandHall, lectureRoom], filterOptions })

    await showLoadedCatalogue()

    expect(screen.getByRole('heading', { name: 'Search by event requirements' })).toBeTruthy()
    expect(screen.getByLabelText('Available from')).toBeTruthy()
    expect(screen.getByLabelText('Available to')).toBeTruthy()
    expect(screen.getByLabelText('Expected attendance')).toBeTruthy()
    const locationOptions = within(screen.getByLabelText('Location')).getAllByRole('option')
    expect(locationOptions.map((option) => option.textContent)).toEqual(['Any location', ...filterOptions.locations])
    const layoutOptions = within(screen.getByLabelText('Layout')).getAllByRole('option')
    expect(layoutOptions.map((option) => option.textContent)).toEqual(['Any layout', ...filterOptions.layouts])

    const accessibility = screen.getByRole('group', { name: 'Accessibility requirements' })
    expect(within(accessibility).getAllByRole('checkbox').map((box) => box.labels[0].textContent)).toEqual([
      'Step-free entrance',
      'Wheelchair access',
    ])
    const facilities = screen.getByRole('group', { name: 'Required facilities' })
    expect(within(facilities).getAllByRole('checkbox').map((box) => box.labels[0].textContent)).toEqual([
      'Mic system',
      'Projector',
    ])
    expect(listVenues).toHaveBeenCalledWith(coordinatorUser)
  })

  it('spm12_frontend_sends_only_the_filters_applied_and_combines_them', async () => {
    listVenues
      .mockResolvedValueOnce({ venues: [grandHall, lectureRoom], filterOptions })
      .mockResolvedValueOnce({ venues: [grandHall], filterOptions })
    const user = await showLoadedCatalogue()

    await user.type(screen.getByLabelText('Expected attendance'), '150')
    await user.selectOptions(screen.getByLabelText('Location'), 'Level 1, Main Campus')
    await user.selectOptions(screen.getByLabelText('Layout'), 'Theatre')
    await user.click(screen.getByRole('checkbox', { name: 'Wheelchair access' }))
    await user.click(screen.getByRole('checkbox', { name: 'Projector' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mic system' }))
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    await waitFor(() => {
      expect(listVenues).toHaveBeenLastCalledWith(coordinatorUser, {
        attendance: 150,
        location: 'Level 1, Main Campus',
        layout: 'Theatre',
        accessibility: ['Wheelchair access'],
        facilities: ['Projector', 'Mic system'],
      })
    })
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '1 venue matches the selected filters.')
    expect(screen.queryByRole('heading', { name: 'Lecture Room' })).toBeNull()
    const applied = screen.getAllByRole('list', { name: 'Applied filters' })[0]
    expect(within(applied).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Expected attendance: 150',
      'Location: Level 1, Main Campus',
      'Layout: Theatre',
      'Accessibility: Wheelchair access',
      'Facilities: Projector, Mic system',
    ])
  })

  it('spm12_frontend_combines_a_date_time_period_with_other_filters', async () => {
    listVenues
      .mockResolvedValueOnce({ venues: [grandHall, lectureRoom], filterOptions })
      .mockResolvedValueOnce({ venues: [lectureRoom], filterOptions })
    const user = await showLoadedCatalogue()

    fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '2026-11-02T10:00' } })
    fireEvent.change(screen.getByLabelText('Available to'), { target: { value: '2026-11-02T12:00' } })
    await user.type(screen.getByLabelText('Expected attendance'), '100')
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    await waitFor(() => {
      expect(listVenues).toHaveBeenLastCalledWith(coordinatorUser, {
        availableFrom: new Date('2026-11-02T10:00').toISOString(),
        availableTo: new Date('2026-11-02T12:00').toISOString(),
        attendance: 100,
      })
    })
    expect(await screen.findByRole('heading', { name: 'Lecture Room' })).toBeTruthy()
  })

  it('spm12_frontend_shows_a_clear_no_matching_venues_message_and_clear_filters_resets_the_search', async () => {
    listVenues
      .mockResolvedValueOnce({ venues: [grandHall, lectureRoom], filterOptions })
      .mockResolvedValueOnce({ venues: [], filterOptions })
      .mockResolvedValueOnce({ venues: [grandHall, lectureRoom], filterOptions })
    const user = await showLoadedCatalogue()

    await user.selectOptions(screen.getByLabelText('Layout'), 'Classroom')
    await user.click(screen.getByRole('checkbox', { name: 'Mic system' }))
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    expect(await screen.findByRole('heading', { name: 'No matching venues' })).toBeTruthy()
    expect(
      screen.getByText('No venues in the catalogue meet all of the selected filters. Change or clear a filter to see more venues.'),
    ).toBeTruthy()
    const applied = screen.getByRole('list', { name: 'Applied filters' })
    expect(within(applied).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Layout: Classroom',
      'Facilities: Mic system',
    ])

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    expect(await screen.findByRole('heading', { name: 'Grand Hall' })).toBeTruthy()
    expect(listVenues).toHaveBeenLastCalledWith(coordinatorUser)
    expect(screen.getByLabelText('Layout')).toHaveProperty('value', '')
    expect(screen.getByRole('checkbox', { name: 'Mic system' })).toHaveProperty('checked', false)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('spm12_frontend_checks_filters_before_searching', async () => {
    listVenues.mockResolvedValue({ venues: [grandHall, lectureRoom], filterOptions })
    const user = await showLoadedCatalogue()

    await user.type(screen.getByLabelText('Expected attendance'), '0')
    fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '2026-11-02T10:00' } })
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    expect(screen.getByText('Enter a positive whole number.')).toBeTruthy()
    expect(screen.getByText('Enter an end, or leave both dates empty.')).toBeTruthy()
    expect(screen.getByLabelText('Expected attendance').getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(screen.getByLabelText('Available to'), { target: { value: '2026-11-02T09:00' } })
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    expect(screen.getByText('The end must be after the start.')).toBeTruthy()
    expect(listVenues).toHaveBeenCalledTimes(1)
  })

  it('spm12_frontend_shows_api_validation_errors_beside_the_filter', async () => {
    listVenues
      .mockResolvedValueOnce({ venues: [grandHall, lectureRoom], filterOptions })
      .mockRejectedValueOnce(
        new ApiRequestError('API_REQUEST_FAILED', {
          status: 400,
          details: { message: 'Validation failed', errors: { facility: 'Each value must be 160 characters or fewer.' } },
        }),
      )
    const user = await showLoadedCatalogue()

    await user.click(screen.getByRole('checkbox', { name: 'Projector' }))
    await user.click(screen.getByRole('button', { name: 'Search available venues' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Some search filters are not valid. Correct the highlighted filters and search again.',
    )
    expect(screen.getByText('Each value must be 160 characters or fewer.')).toBeTruthy()
  })

  it('spm12_frontend_says_when_the_catalogue_records_no_values_to_filter_on', async () => {
    listVenues.mockResolvedValue({
      venues: [grandHall],
      filterOptions: { locations: [], layouts: [], facilities: [], accessibilityFeatures: [] },
    })

    await showLoadedCatalogue()

    expect(screen.getByText('No accessibility features are recorded in the catalogue yet.')).toBeTruthy()
    expect(screen.getByText('No facilities are recorded in the catalogue yet.')).toBeTruthy()
  })
})

describe('SPM-12 — venue search API client', () => {
  it('spm12_client_sends_each_filter_and_repeats_facility_and_accessibility', async () => {
    const { listVenues: listVenuesRequest } = await vi.importActual('../../../frontend/src/services/api.js')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ venues: [], filterOptions }) })
    vi.stubGlobal('fetch', fetchMock)

    await listVenuesRequest(coordinatorUser, {
      availableFrom: '2026-11-02T02:00:00.000Z',
      availableTo: '2026-11-02T04:00:00.000Z',
      attendance: 150,
      location: 'Level 1, Main Campus',
      layout: 'Theatre',
      facilities: ['Projector', 'Mic system'],
      accessibility: ['Wheelchair access'],
    })
    await listVenuesRequest(coordinatorUser)

    const [[filteredUrl], [plainUrl]] = fetchMock.mock.calls
    const query = new URL(filteredUrl).searchParams
    expect(query.get('availableFrom')).toBe('2026-11-02T02:00:00.000Z')
    expect(query.get('availableTo')).toBe('2026-11-02T04:00:00.000Z')
    expect(query.get('attendance')).toBe('150')
    expect(query.get('location')).toBe('Level 1, Main Campus')
    expect(query.get('layout')).toBe('Theatre')
    expect(query.getAll('facility')).toEqual(['Projector', 'Mic system'])
    expect(query.getAll('accessibility')).toEqual(['Wheelchair access'])
    expect(new URL(plainUrl).pathname).toBe('/api/venues')
    expect(new URL(plainUrl).search).toBe('')
  })
})
