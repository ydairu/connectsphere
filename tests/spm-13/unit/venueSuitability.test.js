// SPM-13 AC1–AC10 — the suitability rules: which checks fail a venue, which only warn, and how each is
// named. Also who may ask, and the requirement fields' validation.

import { describe, expect, it } from 'vitest'

import { COORDINATOR, ORGANISER } from '../../../shared/permissions.js'
import { CONFIRMED, PLANNING, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import {
  NOT_AVAILABLE_AT_STATUS,
  NOT_PERMITTED,
  SUITABLE,
  SUITABLE_WITH_WARNINGS,
  UNSUITABLE,
  checkVenueSuitability,
  compareSuitability,
  eventPeriod,
  normaliseVenueRequirementsPatch,
  suitabilityRefusal,
} from '../../../shared/venueSuitability.js'

// Friday 20 November 2026, 09:00–13:00 Singapore time.
const event = Object.freeze({
  id: 'event-1',
  status: PLANNING,
  assignedCoordinatorUid: 'coordinator-1',
  core: { preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 4, expectedAttendees: 120 },
  venue: {
    layoutPreference: 'Theatre',
    accessibilityRequired: true,
    requiredFacilities: ['Projector', 'Mic system'],
    requiredAccessibilityFeatures: ['Wheelchair access'],
  },
})

const goodVenue = Object.freeze({
  id: 'grand-hall',
  name: 'Grand Hall',
  maximumCapacity: 200,
  facilities: ['Projector', 'Mic system', 'Stage'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Theatre', 'Banquet'],
  operatingHours: 'Monday-Friday 08:00-20:00',
})

function withEvent(overrides) {
  return { ...event, core: { ...event.core, ...overrides.core }, venue: { ...event.venue, ...overrides.venue } }
}

function commitment(overrides) {
  return { venueId: 'grand-hall', status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, ...overrides }
}

describe('SPM-13 — venue suitability rules (unit)', () => {
  it('spm13_ac3_a_venue_passing_every_check_is_suitable', () => {
    expect(checkVenueSuitability(event, goodVenue, [])).toEqual({ result: SUITABLE, problems: [], warnings: [] })
  })

  it('spm13_ac4_attendance_equal_to_capacity_passes_the_capacity_check', () => {
    expect(checkVenueSuitability(event, { ...goodVenue, maximumCapacity: 120 }).result).toBe(SUITABLE)
  })

  it('spm13_ac5_attendance_above_capacity_makes_the_venue_unsuitable_with_a_capacity_message', () => {
    const { result, problems } = checkVenueSuitability(event, { ...goodVenue, maximumCapacity: 119 })

    expect(result).toBe(UNSUITABLE)
    expect(problems).toEqual([{ check: 'capacity', message: "Expected attendance (120) is above this venue's capacity (119)." }])
  })

  it('spm13_ac6_a_missing_required_facility_makes_the_venue_unsuitable_and_is_named', () => {
    const { result, problems } = checkVenueSuitability(event, { ...goodVenue, facilities: ['projector'] })

    expect(result).toBe(UNSUITABLE)
    expect(problems).toEqual([{ check: 'facilities', message: 'Missing required facility: Mic system.' }])
  })

  it('spm13_ac7_a_booking_hold_or_block_at_the_event_time_makes_the_venue_unsuitable_and_is_named', () => {
    const { result, problems } = checkVenueSuitability(event, goodVenue, [
      commitment({ startsAt: '2026-11-20T08:00:00+08:00', endsAt: '2026-11-20T10:00:00+08:00' }),
      commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, startsAt: '2026-11-20T12:00:00+08:00', endsAt: '2026-11-20T15:00:00+08:00' }),
      commitment({
        status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
        reason: 'renovation',
        lifecycleStatus: 'active',
        startsAt: '2026-11-20T11:00:00+08:00',
        endsAt: '2026-11-20T11:30:00+08:00',
      }),
    ])

    expect(result).toBe(UNSUITABLE)
    expect(problems.map((problem) => problem.message)).toEqual([
      'Not available: already booked, Fri 20 Nov 2026, 08:00–10:00.',
      'Not available: blocked for renovation, Fri 20 Nov 2026, 11:00–11:30.',
      'Not available: tentatively held for another event, Fri 20 Nov 2026, 12:00–15:00.',
    ])
  })

  it('spm13_ac7_adjacent_removed_and_own_commitments_do_not_make_the_venue_unavailable', () => {
    const { result } = checkVenueSuitability(event, goodVenue, [
      commitment({ startsAt: '2026-11-20T07:00:00+08:00', endsAt: '2026-11-20T09:00:00+08:00' }),
      commitment({ startsAt: '2026-11-20T13:00:00+08:00', endsAt: '2026-11-20T15:00:00+08:00' }),
      commitment({ lifecycleStatus: 'removed', status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, startsAt: '2026-11-20T10:00:00+08:00', endsAt: '2026-11-20T11:00:00+08:00' }),
      commitment({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, eventRequestId: 'event-1', startsAt: '2026-11-20T09:00:00+08:00', endsAt: '2026-11-20T13:00:00+08:00' }),
    ])

    expect(result).toBe(SUITABLE)
  })

  it('spm13_ac7_an_expired_tentative_hold_does_not_make_the_venue_unavailable', () => {
    const now = new Date('2026-11-10T00:00:00.000Z')
    const hold = (holdExpiresAt) =>
      commitment({
        status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
        holdExpiresAt,
        startsAt: '2026-11-20T10:00:00+08:00',
        endsAt: '2026-11-20T12:00:00+08:00',
      })

    expect(checkVenueSuitability(event, goodVenue, [hold('2026-11-09T00:00:00.000Z')], now).result).toBe(SUITABLE)
    expect(checkVenueSuitability(event, goodVenue, [hold('2026-11-12T00:00:00.000Z')], now).result).toBe(UNSUITABLE)
  })

  it('spm13_ac8_an_unsupported_layout_is_a_warning_and_the_venue_is_not_unsuitable', () => {
    const { result, problems, warnings } = checkVenueSuitability(event, { ...goodVenue, supportedLayouts: ['Banquet', 'Classroom'] })

    expect(result).toBe(SUITABLE_WITH_WARNINGS)
    expect(problems).toEqual([])
    expect(warnings).toEqual([{ check: 'layout', message: 'Layout "Theatre" is not supported by this venue (supported: Banquet, Classroom).' }])
  })

  it('spm13_ac9_a_venue_not_marked_wheelchair_accessible_gets_a_warning_and_is_not_unsuitable', () => {
    const { result, warnings } = checkVenueSuitability(event, { ...goodVenue, accessibilityFeatures: ['Hearing loop'] })

    expect(result).toBe(SUITABLE_WITH_WARNINGS)
    expect(warnings).toEqual([{ check: 'accessibility', message: 'This venue is not marked as having Wheelchair access.' }])
  })

  it('spm13_ac2_operating_hours_give_a_warning_when_outside_or_unreadable', () => {
    const outside = checkVenueSuitability(event, { ...goodVenue, operatingHours: 'Monday-Friday 10:00-18:00' })
    const unreadable = checkVenueSuitability(event, { ...goodVenue, operatingHours: 'By appointment' })

    expect(outside.result).toBe(SUITABLE_WITH_WARNINGS)
    expect(outside.warnings).toEqual([
      { check: 'operatingHours', message: "The event is outside this venue's operating hours (Monday-Friday 10:00-18:00)." },
    ])
    expect(unreadable.warnings).toEqual([
      {
        check: 'operatingHours',
        message: 'Operating hours could not be checked automatically ("By appointment"). Check them before selecting this venue.',
      },
    ])
  })

  it('spm13_ac10_every_failed_check_and_every_warning_is_named', () => {
    const { result, problems, warnings } = checkVenueSuitability(
      event,
      {
        ...goodVenue,
        maximumCapacity: 50,
        facilities: [],
        accessibilityFeatures: [],
        supportedLayouts: ['Banquet'],
        operatingHours: 'Saturday 09:00-12:00',
      },
      [commitment({ startsAt: '2026-11-20T10:00:00+08:00', endsAt: '2026-11-20T11:00:00+08:00' })],
    )

    expect(result).toBe(UNSUITABLE)
    expect(problems.map((problem) => problem.check)).toEqual(['capacity', 'availability', 'facilities', 'facilities'])
    expect(problems.filter((problem) => problem.check === 'facilities').map((problem) => problem.message)).toEqual([
      'Missing required facility: Projector.',
      'Missing required facility: Mic system.',
    ])
    expect(warnings.map((warning) => warning.check)).toEqual(['layout', 'accessibility', 'operatingHours'])
  })

  it('spm13_ac2_only_capacity_availability_and_facilities_make_a_venue_unsuitable', () => {
    const warningsOnly = checkVenueSuitability(event, {
      ...goodVenue,
      accessibilityFeatures: [],
      supportedLayouts: [],
      operatingHours: 'By appointment',
    })

    expect(warningsOnly.result).toBe(SUITABLE_WITH_WARNINGS)
    expect(warningsOnly.problems).toEqual([])
  })

  it('spm13_an_event_without_requirements_is_checked_on_capacity_time_layout_and_hours_only', () => {
    const plain = { ...event, venue: { layoutPreference: 'Theatre', accessibilityRequired: false } }

    expect(checkVenueSuitability(plain, { ...goodVenue, facilities: [], accessibilityFeatures: [] }).result).toBe(SUITABLE)
  })

  it('spm13_missing_event_details_are_warned_about_rather_than_passed', () => {
    const { warnings } = checkVenueSuitability(withEvent({ core: { expectedAttendees: null, durationHours: null } }), goodVenue)

    expect(warnings.map((warning) => warning.check)).toEqual(['capacity', 'availability'])
  })

  it('spm13_the_event_period_runs_from_its_preferred_time_for_its_duration', () => {
    expect(eventPeriod(withEvent({ core: { durationHours: 1.5 } }))).toEqual({
      startsAt: '2026-11-20T01:00:00.000Z',
      endsAt: '2026-11-20T02:30:00.000Z',
    })
    expect(eventPeriod(withEvent({ core: { preferredDateTime: null } }))).toBeNull()
  })

  it('spm13_results_are_ordered_suitable_then_warnings_then_unsuitable', () => {
    const results = [
      { name: 'B', result: UNSUITABLE },
      { name: 'C', result: SUITABLE_WITH_WARNINGS },
      { name: 'Z', result: SUITABLE },
      { name: 'A', result: SUITABLE },
    ].sort(compareSuitability)

    expect(results.map((item) => item.name)).toEqual(['A', 'Z', 'C', 'B'])
  })

  it('spm13_only_the_assigned_coordinator_may_check_and_only_under_review_or_in_planning', () => {
    const coordinator = { uid: 'coordinator-1', roles: [COORDINATOR] }

    expect(suitabilityRefusal(coordinator, { ...event, status: UNDER_REVIEW })).toBeNull()
    expect(suitabilityRefusal(coordinator, { ...event, status: PLANNING })).toBeNull()
    expect(suitabilityRefusal(coordinator, { ...event, status: SUBMITTED })).toBe(NOT_AVAILABLE_AT_STATUS)
    expect(suitabilityRefusal(coordinator, { ...event, status: CONFIRMED })).toBe(NOT_AVAILABLE_AT_STATUS)
    expect(suitabilityRefusal({ uid: 'coordinator-2', roles: [COORDINATOR] }, event)).toBe(NOT_PERMITTED)
    expect(suitabilityRefusal({ uid: 'organiser-1', roles: [ORGANISER] }, event)).toBe(NOT_PERMITTED)
  })

  it('spm13_requirement_fields_are_tidied_and_invalid_values_named', () => {
    expect(
      normaliseVenueRequirementsPatch({ venue: { requiredFacilities: [' Projector ', 'projector', '', 'Mic   system'], layoutPreference: 'x' } }),
    ).toEqual({ patch: { venue: { requiredFacilities: ['Projector', 'Mic system'], layoutPreference: 'x' } }, errors: {} })
    expect(normaliseVenueRequirementsPatch({ venue: { requiredFacilities: 'Projector' } }).errors).toEqual({
      'venue.requiredFacilities': 'Must be a list of text values.',
    })
    expect(normaliseVenueRequirementsPatch({ venue: { requiredAccessibilityFeatures: [42] } }).errors).toEqual({
      'venue.requiredAccessibilityFeatures': 'Must contain only text values.',
    })
    expect(normaliseVenueRequirementsPatch({ core: { title: 'x' } })).toEqual({ patch: { core: { title: 'x' } }, errors: {} })
  })
})
