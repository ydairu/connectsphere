// SPM-12 AC1–AC10 — shared venue search rules: query parsing, matching and catalogue filter options.

import { describe, expect, it } from 'vitest'

import {
  buildVenueFilterOptions,
  EMPTY_VENUE_SEARCH_FILTERS,
  normaliseVenueSearchQuery,
  venueMatchesFilters,
} from '../../../shared/venueSearch.js'

const grandHall = Object.freeze({
  id: 'grand-hall',
  name: 'Grand Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 300,
  facilities: ['Projector', 'Mic system', 'Stage'],
  accessibilityFeatures: ['Wheelchair access', 'Hearing loop'],
  supportedLayouts: ['Theatre', 'Banquet'],
})

const seminarRoom = Object.freeze({
  id: 'seminar-room',
  name: 'Seminar Room',
  location: 'Level 2, Main Campus',
  maximumCapacity: 40,
  facilities: ['Projector'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Classroom'],
})

const studio = Object.freeze({
  id: 'studio',
  name: 'Studio',
  location: 'East Wing',
  maximumCapacity: 120,
  facilities: ['Mic system'],
  accessibilityFeatures: ['Step-free entrance'],
  supportedLayouts: ['Theatre'],
})

const catalogue = [grandHall, seminarRoom, studio]

function search(query) {
  const { filters, errors } = normaliseVenueSearchQuery(query)
  expect(errors).toEqual({})
  return catalogue.filter((venue) => venueMatchesFilters(venue, filters)).map((venue) => venue.id)
}

describe('SPM-12 — venue search rules (unit)', () => {
  it('spm12_no_filters_match_every_catalogue_venue', () => {
    expect(normaliseVenueSearchQuery({})).toEqual({ filters: EMPTY_VENUE_SEARCH_FILTERS, errors: {} })
    expect(search({})).toEqual(['grand-hall', 'seminar-room', 'studio'])
  })

  it('spm12_capacity_filter_keeps_venues_with_capacity_at_or_above_expected_attendance', () => {
    expect(search({ attendance: '120' })).toEqual(['grand-hall', 'studio'])
    expect(search({ attendance: '121' })).toEqual(['grand-hall'])
    expect(search({ attendance: '301' })).toEqual([])
    expect(venueMatchesFilters({ ...studio, maximumCapacity: undefined }, { attendance: 1 })).toBe(false)
  })

  it('spm12_location_filter_returns_only_venues_at_that_location', () => {
    expect(search({ location: 'Level 1, Main Campus' })).toEqual(['grand-hall'])
    expect(search({ location: '  level 1,   main campus ' })).toEqual(['grand-hall'])
    // Matching is on the whole recorded location, not part of it.
    expect(search({ location: 'Main Campus' })).toEqual([])
  })

  it('spm12_layout_filter_returns_only_venues_supporting_that_layout', () => {
    expect(search({ layout: 'Theatre' })).toEqual(['grand-hall', 'studio'])
    expect(search({ layout: 'theatre' })).toEqual(['grand-hall', 'studio'])
    expect(search({ layout: 'Cabaret' })).toEqual([])
  })

  it('spm12_accessibility_is_a_yes_no_requirement_per_feature_and_every_ticked_one_is_required', () => {
    expect(search({ accessibility: 'Wheelchair access' })).toEqual(['grand-hall', 'seminar-room'])
    expect(search({ accessibility: ['Wheelchair access', 'Hearing loop'] })).toEqual(['grand-hall'])
  })

  it('spm12_facility_filter_requires_every_selected_facility', () => {
    expect(search({ facility: ['Projector', 'Mic system'] })).toEqual(['grand-hall'])
    expect(search({ facility: 'Projector' })).toEqual(['grand-hall', 'seminar-room'])
    expect(search({ facility: ['projector', 'MIC SYSTEM'] })).toEqual(['grand-hall'])
  })

  it('spm12_filters_combine_and_a_venue_must_meet_all_of_them', () => {
    expect(
      search({
        attendance: '100',
        location: 'East Wing',
        layout: 'Theatre',
        facility: 'Mic system',
        accessibility: 'Step-free entrance',
      }),
    ).toEqual(['studio'])
    expect(search({ attendance: '100', facility: 'Projector', layout: 'Classroom' })).toEqual([])
  })

  it('spm12_query_values_are_trimmed_deduplicated_and_blanks_ignored', () => {
    const { filters, errors } = normaliseVenueSearchQuery({
      attendance: ' 80 ',
      location: '  ',
      layout: ' Theatre ',
      facility: ['Projector', ' projector ', '', 'Mic   system'],
      accessibility: 'Wheelchair access',
    })

    expect(errors).toEqual({})
    expect(filters).toEqual({
      attendance: 80,
      location: null,
      layout: 'Theatre',
      facilities: ['Projector', 'Mic system'],
      accessibility: ['Wheelchair access'],
    })
  })

  it('spm12_invalid_filter_values_are_reported_by_query_parameter', () => {
    for (const attendance of ['0', '-5', '1.5', 'many']) {
      expect(normaliseVenueSearchQuery({ attendance }).errors).toEqual({
        attendance: 'Expected attendance must be a positive whole number.',
      })
    }

    expect(normaliseVenueSearchQuery({ attendance: ['10', '20'] }).errors).toEqual({
      attendance: 'Enter one expected attendance.',
    })
    expect(normaliseVenueSearchQuery({ location: ['A', 'B'], layout: ['Theatre', 'Banquet'] }).errors).toEqual({
      location: 'Choose one location.',
      layout: 'Choose one layout.',
    })
    expect(normaliseVenueSearchQuery({ facility: 'x'.repeat(161) }).errors).toEqual({
      facility: 'Each value must be 160 characters or fewer.',
    })
    expect(normaliseVenueSearchQuery({ accessibility: [{ wheelchair: true }] }).errors).toEqual({
      accessibility: 'Must contain only text values.',
    })
  })

  it('spm12_filter_options_are_the_distinct_values_recorded_in_the_catalogue', () => {
    const options = buildVenueFilterOptions([
      ...catalogue,
      { ...studio, id: 'studio-2', location: ' east  wing ', facilities: ['projector'], supportedLayouts: undefined },
      { id: 'legacy', name: 'Legacy', facilities: [], accessibilityFeatures: [] },
    ])

    expect(options).toEqual({
      locations: ['East Wing', 'Level 1, Main Campus', 'Level 2, Main Campus'],
      layouts: ['Banquet', 'Classroom', 'Theatre'],
      facilities: ['Mic system', 'Projector', 'Stage'],
      accessibilityFeatures: ['Hearing loop', 'Step-free entrance', 'Wheelchair access'],
    })
    expect(buildVenueFilterOptions([])).toEqual({ locations: [], layouts: [], facilities: [], accessibilityFeatures: [] })
  })
})
