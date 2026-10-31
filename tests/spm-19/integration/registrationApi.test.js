// SPM-19 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP against the real
// Express app, authenticate middleware, registration service and shared rules. Mocked: token verification and
// persistence (backend/src/testing/fakeFirestore.js). Not database verification: the fake does not run
// transactions concurrently, so the race for the last place is proven by registration.emulator.test.js.
//
// The two-place seeded event's start and registration period are moved relative to the real clock before each
// test, because the API reads the real clock.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { REGISTRATION_CONFIRMED_NOTICE } from '../../../shared/notifications.js'
import { REGISTRATIONS_COLLECTION, REGISTERED } from '../../../shared/registration.js'
import { CONFIRMED, PLANNING, PREPARATION } from '../../../shared/status.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, organiserA2, coordinator, coordinator2, venueStaff, attendee, attendee2, attendee3 } = SEED_ACCOUNTS
const SMALL_ID = 'seed-req-a1-confirmed-small'
const PLANNING_ID = 'seed-req-a1-planning'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const api = createCancellationApi()

const iso = (offset) => new Date(Date.now() + offset).toISOString()
const register = (account, id = SMALL_ID) => api.call('POST', `/api/requests/${id}/registrations`, account)
const listFor = (account, id = SMALL_ID) => api.call('GET', `/api/requests/${id}/registrations`, account)
const mine = async (account) => (await api.call('GET', '/api/registrations', account)).json.registrations
const summary = async (account, id = SMALL_ID) => (await api.view(account, id)).json.attendeeRegistration
const patchRegistration = (account, fields, id = SMALL_ID) => api.call('PATCH', `/api/requests/${id}`, account, { registration: fields })

// The event starts in 30 days; registration opened a day ago and closes the day before the event.
function openRegistration(id = SMALL_ID, changes = {}) {
  const event = api.stored(id)
  api.updateStored(id, {
    core: { ...event.core, preferredDateTime: iso(30 * DAY) },
    registration: { ...event.registration, enabled: true, opensAt: iso(-DAY), closesAt: iso(29 * DAY), capacity: 2, ...changes },
  })
}

// SPM-79: an approved venue booking for the event, at a venue of the given capacity.
function approvedVenue(capacity, id = SMALL_ID, name = 'Seed Hall') {
  api.putDocument('venues', `venue-${capacity}`, { name, maximumCapacity: capacity })
  api.putDocument('venueBookingRequests', `booking-${id}-${capacity}`, { eventRequestId: id, venueId: `venue-${capacity}`, venueName: name, status: 'approved', venueNeedId: `need-${capacity}`, createdAt: iso(-DAY) })
}

beforeAll(api.start)
afterAll(api.stop)
beforeEach(() => {
  api.reset()
  openRegistration()
})

describe('SPM-19 AC1 — registration is only available for Confirmed events with registration enabled', () => {
  it('spm19_seed_fixture_is_a_confirmed_two_place_event_with_registration_enabled', () => {
    expect(api.stored(SMALL_ID)).toMatchObject({ status: CONFIRMED, ownerUid: organiserA1.uid, assignedCoordinatorUid: coordinator.uid, registration: { enabled: true, capacity: 2 } })
  })

  it('spm19_an_attendee_cannot_reach_an_event_before_confirmation_or_without_registration_enabled', async () => {
    api.updateStored(PLANNING_ID, { registration: { enabled: true } })
    expect((await register(attendee, PLANNING_ID)).status).toBe(403)
    api.updateStored(SMALL_ID, { registration: { ...api.stored(SMALL_ID).registration, enabled: false } })
    expect((await register(attendee)).status).toBe(403)
    expect(api.documents(REGISTRATIONS_COLLECTION)).toEqual([])
  })

  it('spm19_registration_stays_open_during_preparation', async () => {
    api.updateStored(SMALL_ID, { status: PREPARATION })
    expect((await register(attendee)).status).toBe(201)
  })

  it('spm19_d5_an_event_moved_back_to_planning_keeps_its_registrations_but_takes_no_new_ones', async () => {
    expect((await register(attendee)).status).toBe(201)
    api.updateStored(SMALL_ID, { status: PLANNING })
    expect((await register(attendee2)).status).toBe(403)
    expect(await mine(attendee)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, status: REGISTERED })])
    expect((await listFor(coordinator)).json.registeredCount).toBe(1)
  })
})

describe('SPM-19 AC2 — the Organiser\'s period, and the capacity limit', () => {
  it('spm19_registration_is_refused_before_it_opens_and_after_it_closes', async () => {
    openRegistration(SMALL_ID, { opensAt: iso(HOUR), closesAt: iso(2 * DAY) })
    expect(await summary(attendee)).toMatchObject({ canRegister: false, reason: 'not_open_yet' })
    expect((await register(attendee)).json).toMatchObject({ reason: 'not_open_yet' })
    openRegistration(SMALL_ID, { opensAt: iso(-2 * DAY), closesAt: iso(-HOUR) })
    const refused = await register(attendee)
    expect(refused.status).toBe(409)
    expect(refused.json).toEqual({ message: 'Registration has closed.', reason: 'closed' })
    expect(api.documents(REGISTRATIONS_COLLECTION)).toEqual([])
  })

  it('spm19_a_period_or_capacity_that_is_not_set_is_refused_as_not_configured', async () => {
    openRegistration(SMALL_ID, { capacity: null })
    expect((await register(attendee)).json.reason).toBe('not_configured')
  })

  it('spm19_registration_is_limited_by_capacity', async () => {
    expect((await register(attendee)).status).toBe(201)
    expect(await summary(attendee2)).toMatchObject({ canRegister: true, placesLeft: 1 })
    expect((await register(attendee2)).status).toBe(201)
    expect(await summary(attendee3)).toMatchObject({ canRegister: false, reason: 'full', placesLeft: 0 })
    const refused = await register(attendee3)
    expect(refused.status).toBe(409)
    expect(refused.json).toEqual({ message: 'This event is full.', reason: 'full' })
    expect(api.documents(REGISTRATIONS_COLLECTION)).toHaveLength(2)
  })

  it('spm19_d2_the_approved_venue_capacity_caps_the_organisers_capacity', async () => {
    approvedVenue(1)
    expect(await summary(attendee)).toMatchObject({ placesLeft: 1, venueNames: ['Seed Hall'] })
    expect((await register(attendee)).status).toBe(201)
    expect((await register(attendee2)).json.reason).toBe('full')
    expect((await listFor(organiserA1)).json).toMatchObject({ registeredCount: 1, capacity: 1 })
  })

  it('spm90_primary_venue_controls_registration_capacity_and_confirmation', async () => {
    approvedVenue(2, SMALL_ID, 'Primary Room')
    approvedVenue(10, SMALL_ID, 'Larger Hall')
    api.updateStored(SMALL_ID, { primaryVenue: { bookingId: `booking-${SMALL_ID}-2`, venueName: 'Primary Room' } })

    expect((await patchRegistration(organiserA1, { capacity: 3 })).json.errors).toHaveProperty('registration.capacity')
    expect(await summary(attendee)).toMatchObject({ placesLeft: 2, venueNames: ['Primary Room'] })
    expect((await listFor(coordinator)).json.capacity).toBe(2)
    const first = await register(attendee)
    expect(first.status).toBe(201)
    expect(first.json.registration.venueNames).toEqual(['Primary Room'])
    expect((await api.notificationsOf(attendee))[0].message).toContain('at Primary Room.')
    expect((await register(attendee2)).status).toBe(201)
    expect((await register(attendee3)).json.reason).toBe('full')
  })

  it('spm90_a_primary_venue_switch_changes_new_registrations_but_keeps_prior_snapshots', async () => {
    approvedVenue(2, SMALL_ID, 'Primary Room')
    approvedVenue(10, SMALL_ID, 'Larger Hall')
    api.updateStored(SMALL_ID, { primaryVenue: { bookingId: `booking-${SMALL_ID}-2`, venueName: 'Primary Room' } })
    expect((await register(attendee)).json.registration.venueNames).toEqual(['Primary Room'])

    api.updateStored(SMALL_ID, { primaryVenue: { bookingId: `booking-${SMALL_ID}-10`, venueName: 'Larger Hall' } })
    expect(await summary(attendee2)).toMatchObject({ venueNames: ['Larger Hall'], placesLeft: 1 })
    expect((await register(attendee2)).json.registration.venueNames).toEqual(['Larger Hall'])
    expect((await mine(attendee))[0].venueNames).toEqual(['Primary Room'])
  })

  it('spm19_the_owner_sets_the_period_and_capacity_after_confirmation_and_nothing_else', async () => {
    const saved = await patchRegistration(organiserA1, { capacity: '5', closesAt: iso(10 * DAY) })
    expect(saved.status).toBe(200)
    expect(saved.json.editableSections).toEqual(['registration'])
    expect(api.stored(SMALL_ID).registration).toMatchObject({ capacity: 5, enabled: true })
    const core = await api.call('PATCH', `/api/requests/${SMALL_ID}`, organiserA1, { core: { title: 'Changed' } })
    expect(core.status).toBe(403)
    expect(core.json.forbiddenFields).toEqual(['core.title'])
  })

  it('spm19_the_owner_can_close_registration_by_disabling_it', async () => {
    expect((await patchRegistration(organiserA1, { enabled: false })).status).toBe(200)
    expect((await register(attendee)).status).toBe(403)
  })

  it('spm19_invalid_settings_are_refused_with_400_naming_the_field_and_nothing_changes', async () => {
    approvedVenue(10)
    const before = api.stored(SMALL_ID).registration
    for (const [fields, path] of [
      [{ closesAt: iso(31 * DAY) }, 'registration.closesAt'],
      [{ opensAt: iso(29 * DAY), closesAt: iso(28 * DAY) }, 'registration.closesAt'],
      [{ capacity: 11 }, 'registration.capacity'],
      [{ capacity: 0 }, 'registration.capacity'],
      [{ opensAt: 'next week' }, 'registration.opensAt'],
    ]) {
      const refused = await patchRegistration(organiserA1, fields)
      expect(refused.status, JSON.stringify(fields)).toBe(400)
      expect(Object.keys(refused.json.errors)).toEqual([path])
    }
    expect(api.stored(SMALL_ID).registration).toEqual(before)
  })

  it('spm19_a_colleague_cannot_change_the_registration_settings', async () => {
    const refused = await patchRegistration(organiserA2, { capacity: 10 })
    expect(refused.status).toBe(403)
    expect(refused.json.forbiddenFields).toEqual(['registration.capacity'])
  })
})

describe('SPM-19 AC3 — a successful registration is confirmed with the event information', () => {
  it('spm19_an_attendee_registers_and_receives_the_event_information', async () => {
    approvedVenue(50)
    const response = await register(attendee)
    expect(response.status).toBe(201)
    expect(response.json.registration).toMatchObject({
      eventRequestId: SMALL_ID,
      status: REGISTERED,
      eventTitle: 'A1 confirmed (2 places, registration open)',
      eventStartsAt: api.stored(SMALL_ID).core.preferredDateTime,
      venueNames: ['Seed Hall'],
    })
    const [notice] = await api.notificationsOf(attendee)
    expect(notice).toMatchObject({ type: REGISTRATION_CONFIRMED_NOTICE, eventRequestId: SMALL_ID, eventStartsAt: api.stored(SMALL_ID).core.preferredDateTime })
    expect(notice.message).toBe('You are registered for “A1 confirmed (2 places, registration open)” at Seed Hall.')
    expect(await summary(attendee)).toMatchObject({ canRegister: false, reason: 'already_registered', myRegistration: { status: REGISTERED } })
  })

  it('spm19_an_attendee_registers_once', async () => {
    await register(attendee)
    const again = await register(attendee)
    expect(again.status).toBe(409)
    expect(again.json.reason).toBe('already_registered')
    expect(api.documents(REGISTRATIONS_COLLECTION)).toHaveLength(1)
  })

  it('spm19_my_registrations_lists_only_the_callers_own', async () => {
    await register(attendee)
    expect(await mine(attendee)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, status: REGISTERED })])
    expect(await mine(attendee2)).toEqual([])
    expect((await api.call('GET', '/api/registrations')).status).toBe(401)
  })

  it('spm19_only_attendees_can_register', async () => {
    for (const account of [organiserA1, coordinator]) {
      const refused = await register(account)
      expect(refused.status, account.uid).toBe(403)
    }
    expect(api.documents(REGISTRATIONS_COLLECTION)).toEqual([])
  })

  it('spm19_simultaneous_registrations_cannot_overfill_the_event_in_memory', async () => {
    const results = await Promise.all([attendee, attendee2, attendee3].map((account) => register(account)))
    expect(results.map((result) => result.status).sort()).toEqual([201, 201, 409])
    expect(api.documents(REGISTRATIONS_COLLECTION)).toHaveLength(2)
  })
})

describe('SPM-19 AC4 / D3 — registration details for the Organiser and Coordinator, subject to access', () => {
  beforeEach(async () => {
    await register(attendee)
  })

  it('spm19_the_owning_organiser_and_assigned_coordinator_see_the_count_and_list', async () => {
    for (const account of [organiserA1, coordinator]) {
      const response = await listFor(account)
      expect(response.status, account.uid).toBe(200)
      expect(response.json).toEqual({
        registeredCount: 1,
        capacity: 2,
        // SPM-39: the waiting-list count is part of the same response.
        waitingListCount: 0,
        // SPM-59: and the places held for open invitations.
        invitedCount: 0,
        registrations: [{ name: attendee.name, email: attendee.email, status: REGISTERED, registeredAt: expect.any(String) }],
      })
      expect((await api.view(account, SMALL_ID)).json.canViewRegistrations).toBe(true)
    }
  })

  it('spm19_everyone_else_is_refused_at_the_api', async () => {
    expect((await listFor(organiserA2)).status).toBe(403)
    expect((await listFor(coordinator2)).status).toBe(404)
    expect((await listFor(venueStaff)).status).toBe(403)
    expect((await listFor(attendee2)).status).toBe(403)
    expect((await api.view(attendee2, SMALL_ID)).json.canViewRegistrations).toBe(false)
  })

  it('spm19_attendees_never_receive_the_registration_section_or_other_attendees', async () => {
    const viewed = (await api.view(attendee2, SMALL_ID)).json
    expect(viewed.request.registration).toBeUndefined()
    expect(JSON.stringify(viewed)).not.toContain(attendee.email)
  })
})
