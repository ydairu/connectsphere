// SPM-19 — the registration rules in shared/registration.js, the settings validation in shared/eventRequest.js
// and the Organiser's registration edit after confirmation in shared/permissions.js (D1). Pure functions only;
// the API suite checks that the backend applies them.

import { describe, expect, it } from 'vitest'

import { normaliseEventRequestInput, normaliseRegistrationSettings } from '../../../shared/eventRequest.js'
import { ATTENDEE, COORDINATOR, ORGANISER, VENUE_STAFF, canEdit, editableSectionsFor } from '../../../shared/permissions.js'
import {
  ALREADY_REGISTERED,
  CLOSED,
  FULL,
  NOT_ATTENDEE,
  NOT_CONFIGURED,
  NOT_ENABLED,
  NOT_OPEN_YET,
  REGISTERED,
  WRONG_STATUS,
  attendeeRegistrationSummary,
  buildRegistration,
  canRegister,
  canViewRegistrations,
  effectiveCapacity,
  registrationAvailability,
  registrationId,
  registrationSettingsErrors,
  staffRegistrationSummary,
  venueCapacityOf,
} from '../../../shared/registration.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, PREPARATION, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const owner = { uid: 'org-1', roles: [ORGANISER], organisationId: 'org-a' }
const colleague = { uid: 'org-2', roles: [ORGANISER], organisationId: 'org-a' }
const coordinator = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }
const attendee = { uid: 'att-1', roles: [ATTENDEE], name: 'Ada', email: 'ada@example.test' }
const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }

const event = (changes = {}) => ({
  id: 'event-1',
  status: CONFIRMED,
  ownerUid: owner.uid,
  organisationId: 'org-a',
  assignedCoordinatorUid: coordinator.uid,
  assignedStaffUids: [venueStaff.uid],
  core: { title: 'Partner Forum', preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: 3 },
  registration: { enabled: true, opensAt: '2026-10-25T00:00:00.000Z', closesAt: '2026-11-19T00:00:00.000Z', capacity: 2 },
  ...changes,
})
const withRegistration = (changes) => event({ registration: { ...event().registration, ...changes } })

describe('SPM-19 AC1 — registration only for Confirmed (or Preparation) events with registration enabled', () => {
  it('spm19_registration_is_open_on_a_confirmed_event_in_its_period_below_capacity', () => {
    expect(registrationAvailability(event(), { now: NOW })).toEqual({ open: true, reason: null, capacity: 2, placesLeft: 2 })
  })

  it('spm19_registration_stays_open_during_preparation', () => {
    expect(registrationAvailability(event({ status: PREPARATION }), { now: NOW }).open).toBe(true)
  })

  it('spm19_registration_is_closed_before_confirmation_and_after_the_event_closes', () => {
    for (const status of [DRAFT, SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, COMPLETED, CANCELLED]) {
      expect(registrationAvailability(event({ status }), { now: NOW }).reason, status).toBe(WRONG_STATUS)
    }
  })

  it('spm19_registration_is_unavailable_when_not_enabled', () => {
    expect(registrationAvailability(withRegistration({ enabled: false }), { now: NOW }).reason).toBe(NOT_ENABLED)
  })
})

describe('SPM-19 AC2 — the Organiser\'s registration period and the capacity limit', () => {
  it('spm19_before_opening_and_from_closing_registration_is_unavailable', () => {
    expect(registrationAvailability(event(), { now: new Date('2026-10-24T23:59:59.000Z') }).reason).toBe(NOT_OPEN_YET)
    expect(registrationAvailability(event(), { now: new Date('2026-10-25T00:00:00.000Z') }).open).toBe(true)
    expect(registrationAvailability(event(), { now: new Date('2026-11-19T00:00:00.000Z') }).reason).toBe(CLOSED)
  })

  it('spm19_a_period_or_capacity_that_is_not_set_means_not_configured', () => {
    for (const missing of ['opensAt', 'closesAt', 'capacity']) {
      expect(registrationAvailability(withRegistration({ [missing]: null }), { now: NOW }).reason, missing).toBe(NOT_CONFIGURED)
    }
  })

  it('spm19_the_event_is_full_when_active_registrations_reach_the_capacity', () => {
    expect(registrationAvailability(event(), { now: NOW, registeredCount: 1 })).toMatchObject({ open: true, placesLeft: 1 })
    expect(registrationAvailability(event(), { now: NOW, registeredCount: 2 })).toMatchObject({ open: false, reason: FULL, placesLeft: 0 })
  })

  it('spm19_d2_the_limit_is_the_smaller_of_the_organisers_capacity_and_the_largest_approved_venue', () => {
    expect(venueCapacityOf([{ maximumCapacity: 40 }, { maximumCapacity: 120 }, { maximumCapacity: null }])).toBe(120)
    expect(venueCapacityOf([])).toBeNull()
    expect(effectiveCapacity({ capacity: 200 }, 120)).toBe(120)
    expect(effectiveCapacity({ capacity: 50 }, 120)).toBe(50)
    expect(effectiveCapacity({ capacity: 50 }, null)).toBe(50)
    expect(registrationAvailability(withRegistration({ capacity: 5 }), { now: NOW, venueCapacity: 1, registeredCount: 1 }).reason).toBe(FULL)
  })

  it('spm19_settings_must_open_before_closing_close_by_the_event_start_and_stay_within_the_venue', () => {
    const core = event().core
    expect(registrationSettingsErrors(event().registration, core)).toEqual({})
    expect(registrationSettingsErrors({ opensAt: '2026-11-10T00:00:00Z', closesAt: '2026-11-10T00:00:00Z' }, core)).toEqual({ 'registration.closesAt': 'Registration must close after it opens.' })
    expect(registrationSettingsErrors({ closesAt: '2026-11-21T00:00:00Z' }, core)).toEqual({ 'registration.closesAt': 'Registration must close by the event start.' })
    expect(registrationSettingsErrors({ capacity: 121 }, core, 120)).toEqual({ 'registration.capacity': 'Capacity cannot be more than the venue capacity (120).' })
    expect(registrationSettingsErrors({ capacity: 120 }, core, 120)).toEqual({})
  })

  it('spm19_the_request_form_normalises_and_checks_the_settings', () => {
    const { eventRequest, errors } = normaliseEventRequestInput({
      core: { preferredDateTime: '2026-11-20T09:00:00Z' },
      registration: { enabled: true, opensAt: '2026-11-01T09:00', closesAt: '2026-11-25T09:00:00Z', capacity: '30' },
    })
    expect(eventRequest.registration).toMatchObject({ enabled: true, capacity: 30 })
    expect(errors).toEqual({ 'registration.closesAt': 'Registration must close by the event start.' })
    expect(normaliseRegistrationSettings({ capacity: 0, opensAt: 'soon' }).errors).toEqual({
      'registration.opensAt': 'Must be a valid date/time.',
      'registration.capacity': 'Must be a positive whole number.',
    })
    expect(normaliseRegistrationSettings({ notes: 'x' }).value).toEqual({})
  })
})

describe('SPM-19 D1 — the owner may edit only registration once the event is Confirmed or Preparation', () => {
  it('spm19_the_owner_edits_registration_alone_at_confirmed_and_preparation', () => {
    for (const status of [CONFIRMED, PREPARATION]) {
      expect(editableSectionsFor(owner, event({ status })), status).toEqual(['registration'])
    }
  })

  it('spm19_the_owner_stays_locked_out_at_submitted_under_review_planning_and_closed_statuses', () => {
    for (const status of [SUBMITTED, UNDER_REVIEW, PLANNING, COMPLETED, CANCELLED]) {
      expect(canEdit(owner, event({ status }), 'registration'), status).toBe(false)
    }
  })

  it('spm19_a_colleague_cannot_edit_registration_and_the_coordinator_keeps_its_rights', () => {
    expect(editableSectionsFor(colleague, event())).toEqual([])
    expect(editableSectionsFor(coordinator, event())).toEqual(['core', 'venue', 'equipment', 'registration', 'internal'])
  })
})

describe('SPM-19 AC3 — who may register', () => {
  it('spm19_only_an_attendee_may_register_and_only_once', () => {
    expect(canRegister(attendee, event(), { now: NOW })).toMatchObject({ allowed: true, reason: null })
    expect(canRegister(owner, event(), { now: NOW })).toMatchObject({ allowed: false, reason: NOT_ATTENDEE })
    expect(canRegister(attendee, event(), { now: NOW, existing: { status: REGISTERED } })).toMatchObject({ allowed: false, reason: ALREADY_REGISTERED })
  })

  it('spm19_a_registration_records_the_attendee_and_the_event_information', () => {
    expect(registrationId('event-1', 'att-1')).toBe('event-1_att-1')
    expect(buildRegistration(event(), attendee, { venueNames: ['Hall A'], at: NOW.toISOString() })).toEqual({
      eventRequestId: 'event-1',
      attendeeUid: 'att-1',
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.test',
      status: REGISTERED,
      eventTitle: 'Partner Forum',
      eventStartsAt: '2026-11-20T09:00:00.000Z',
      eventDurationHours: 3,
      venueNames: ['Hall A'],
      registeredAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })
  })

  it('spm19_the_attendee_summary_never_carries_the_organisers_notes', () => {
    const summary = attendeeRegistrationSummary(attendee, withRegistration({ notes: 'Internal note' }), { now: NOW, venueNames: ['Hall A'] })
    expect(summary).toMatchObject({ canRegister: true, placesLeft: 2, venueNames: ['Hall A'], myRegistration: null })
    expect(JSON.stringify(summary)).not.toContain('Internal note')
    expect(attendeeRegistrationSummary(owner, event(), { now: NOW })).toBeNull()
  })
})

describe('SPM-19 AC4 / D3 — the registered list', () => {
  it('spm19_the_owning_organiser_and_the_assigned_coordinator_may_view_registrations', () => {
    expect(canViewRegistrations(owner, event())).toBe(true)
    expect(canViewRegistrations(coordinator, event())).toBe(true)
    expect(staffRegistrationSummary(owner, event(), { registeredCount: 1, venueCapacity: 1 })).toEqual({ registeredCount: 1, capacity: 1 })
  })

  it('spm19_colleagues_unassigned_coordinators_staff_and_attendees_may_not', () => {
    for (const user of [colleague, otherCoordinator, venueStaff, attendee]) {
      expect(canViewRegistrations(user, event()), user.uid).toBe(false)
    }
  })
})
