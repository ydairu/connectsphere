// SPM-72 — Venue Staff configure each venue's setup and turnaround time (POST/PATCH/GET /api/venues).
// Real Express routing and middleware, mocked token verification, in-memory Firestore.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { VENUE_FIELD_CHANGED } from '../../../backend/src/services/venueService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'

const TOKEN_PREFIX = 'test-token:'
const DAY_MS = 24 * 60 * 60 * 1000

const users = {
  venueStaff: { uid: 'venue-staff-1', name: 'Venue Staff One', roles: [VENUE_STAFF] },
  coordinator: { uid: 'coordinator-1', name: 'Coordinator One', roles: [COORDINATOR] },
  organiser: { uid: 'organiser-1', name: 'Organiser One', roles: [ORGANISER] },
  technicalStaff: { uid: 'technical-1', name: 'Technical One', roles: [TECHNICAL_STAFF] },
  attendee: { uid: 'attendee-1', name: 'Attendee One', roles: [ATTENDEE] },
}
const profiles = new Map(Object.values(users).map((user) => [user.uid, user]))

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

// Every catalogue field, as the edit page sends them.
const catalogueInput = Object.freeze({
  location: 'Level 1, Main Campus',
  maximumCapacity: 200,
  facilities: ['Projector'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Theatre'],
  operatingHours: 'Monday-Friday 08:00-20:00',
})

function storedVenue(name, overrides = {}) {
  return { name, ...catalogueInput, createdByUid: 'seed', createdAt: '2026-10-01T00:00:00.000Z', ...overrides }
}

function isoFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString()
}

let db
let server
let baseUrl

beforeEach(async () => {
  db = createFakeFirestore({
    venues: {
      // Created before SPM-72: no setup or turnaround stored.
      'legacy-hall': storedVenue('Legacy Hall'),
      'booked-hall': storedVenue('Booked Hall', { setupMinutes: 30, turnaroundMinutes: 45 }),
      'free-hall': storedVenue('Free Hall', { setupMinutes: 10, turnaroundMinutes: 10 }),
    },
    venueAvailability: {
      'booked-hall-confirmed': {
        venueId: 'booked-hall',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: isoFromNow(7 * DAY_MS),
        endsAt: isoFromNow(7 * DAY_MS + 2 * 60 * 60 * 1000),
      },
      // None of these lock Free Hall: one has ended, one was removed, one is only a hold.
      'free-hall-past': {
        venueId: 'free-hall',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: isoFromNow(-8 * DAY_MS),
        endsAt: isoFromNow(-7 * DAY_MS),
      },
      'free-hall-removed': {
        venueId: 'free-hall',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        lifecycleStatus: 'removed',
        startsAt: isoFromNow(3 * DAY_MS),
        endsAt: isoFromNow(4 * DAY_MS),
      },
      'free-hall-hold': {
        venueId: 'free-hall',
        status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
        startsAt: isoFromNow(5 * DAY_MS),
        endsAt: isoFromNow(6 * DAY_MS),
      },
    },
  })

  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(
  () =>
    new Promise((resolve) => {
      server.close(resolve)
    }),
)

async function requestJson(path, { method = 'GET', uid = users.venueStaff.uid, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json() }
}

function stored(id) {
  return db.collectionData('venues').get(id)
}

function activity(id) {
  return [...db.collectionData(`venues/${id}/activity`).values()]
}

describe('SPM-72 — venue setup and turnaround API (integration)', () => {
  it('spm72_api_reads_a_venue_created_before_spm72_as_zero_minutes', async () => {
    const response = await requestJson('/api/venues/legacy-hall')

    expect(response.status).toBe(200)
    expect(response.json.venue).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0, bufferTimesLocked: false })
  })

  it('spm72_api_stores_the_times_entered_when_a_venue_is_added_and_shows_them_on_the_venue', async () => {
    const created = await requestJson('/api/venues', {
      method: 'POST',
      body: { name: 'New Hall', ...catalogueInput, setupMinutes: '30', turnaroundMinutes: '45' },
    })
    const opened = await requestJson(`/api/venues/${created.json.venue.id}`, { uid: users.coordinator.uid })

    expect(created.status).toBe(201)
    expect(stored(created.json.venue.id)).toMatchObject({
      setupMinutes: 30,
      turnaroundMinutes: 45,
      createdByUid: users.venueStaff.uid,
    })
    expect(opened.status).toBe(200)
    expect(opened.json.venue).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45 })
  })

  it('spm72_api_defaults_a_new_venue_to_zero_minutes_when_no_times_are_sent', async () => {
    const created = await requestJson('/api/venues', { method: 'POST', body: { name: 'Plain Hall', ...catalogueInput } })

    expect(created.status).toBe(201)
    expect(stored(created.json.venue.id)).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0 })
  })

  it('spm72_api_blocks_negative_or_non_numeric_times_and_names_each_field', async () => {
    const venuesBefore = db.collectionData('venues').size
    const created = await requestJson('/api/venues', {
      method: 'POST',
      body: { name: 'Bad Hall', ...catalogueInput, setupMinutes: '-5', turnaroundMinutes: 'abc' },
    })
    const legacyBefore = structuredClone(stored('legacy-hall'))
    const edited = await requestJson('/api/venues/legacy-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, setupMinutes: '1.5' },
    })

    expect(created.status).toBe(400)
    expect(created.json.errors).toEqual({
      setupMinutes: 'Must be a whole number of minutes, 0 or more.',
      turnaroundMinutes: 'Must be a whole number of minutes, 0 or more.',
    })
    expect(db.collectionData('venues').size).toBe(venuesBefore)
    expect(edited.status).toBe(400)
    expect(edited.json.errors).toEqual({ setupMinutes: 'Must be a whole number of minutes, 0 or more.' })
    expect(stored('legacy-hall')).toEqual(legacyBefore)
    expect(activity('legacy-hall')).toEqual([])
  })

  it('spm72_api_stores_edited_times_and_records_the_values_who_set_them_and_when', async () => {
    const response = await requestJson('/api/venues/legacy-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, setupMinutes: 30, turnaroundMinutes: '15' },
    })

    expect(response.status).toBe(200)
    expect(stored('legacy-hall')).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 15 })
    const entries = activity('legacy-hall')
    expect(entries).toEqual([
      expect.objectContaining({ type: VENUE_FIELD_CHANGED, field: 'setupMinutes', oldValue: 0, newValue: 30 }),
      expect.objectContaining({ type: VENUE_FIELD_CHANGED, field: 'turnaroundMinutes', oldValue: 0, newValue: 15 }),
    ])
    for (const entry of entries) {
      expect(entry.actor).toEqual({ type: 'user', uid: users.venueStaff.uid, name: 'Venue Staff One', role: VENUE_STAFF })
      expect(Number.isNaN(Date.parse(entry.at))).toBe(false)
    }
  })

  it('spm72_api_first_edit_of_an_older_venue_records_no_change_from_nothing_to_zero', async () => {
    const response = await requestJson('/api/venues/legacy-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, maximumCapacity: 250 },
    })

    expect(response.status).toBe(200)
    expect(stored('legacy-hall')).toMatchObject({ setupMinutes: 0, turnaroundMinutes: 0, maximumCapacity: 250 })
    expect(activity('legacy-hall').map((entry) => entry.field)).toEqual(['maximumCapacity'])
  })

  it('spm72_api_keeps_saved_times_when_an_edit_does_not_send_them', async () => {
    const response = await requestJson('/api/venues/free-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, location: 'Level 2, Main Campus' },
    })

    expect(response.status).toBe(200)
    expect(stored('free-hall')).toMatchObject({ setupMinutes: 10, turnaroundMinutes: 10, location: 'Level 2, Main Campus' })
  })

  it('spm72_api_marks_the_times_locked_while_the_venue_has_a_confirmed_booking', async () => {
    const booked = await requestJson('/api/venues/booked-hall')
    const free = await requestJson('/api/venues/free-hall')

    expect(booked.json.venue).toMatchObject({ setupMinutes: 30, turnaroundMinutes: 45, bufferTimesLocked: true })
    expect(free.json.venue.bufferTimesLocked).toBe(false)
  })

  it('spm72_api_refuses_to_change_the_times_of_a_venue_with_a_confirmed_booking', async () => {
    const before = structuredClone(stored('booked-hall'))
    const response = await requestJson('/api/venues/booked-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, location: 'Level 9', setupMinutes: 60, turnaroundMinutes: 45 },
    })

    expect(response.status).toBe(409)
    expect(response.json.errors).toEqual({
      setupMinutes: 'Setup time cannot be changed while this venue has a confirmed booking.',
    })
    expect(stored('booked-hall')).toEqual(before)
    expect(activity('booked-hall')).toEqual([])
  })

  it('spm72_api_still_saves_other_details_of_a_booked_venue_when_the_times_are_unchanged', async () => {
    const response = await requestJson('/api/venues/booked-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, location: 'Level 9', setupMinutes: 30, turnaroundMinutes: 45 },
    })
    const withoutTimes = await requestJson('/api/venues/booked-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, location: 'Level 10' },
    })

    expect(response.status).toBe(200)
    expect(withoutTimes.status).toBe(200)
    expect(stored('booked-hall')).toMatchObject({ location: 'Level 10', setupMinutes: 30, turnaroundMinutes: 45 })
    expect(activity('booked-hall').map((entry) => entry.field)).toEqual(['location', 'location'])
  })

  it('spm72_api_allows_changes_when_only_past_removed_or_tentative_commitments_exist', async () => {
    const response = await requestJson('/api/venues/free-hall', {
      method: 'PATCH',
      body: { ...catalogueInput, setupMinutes: 20, turnaroundMinutes: 25 },
    })

    expect(response.status).toBe(200)
    expect(stored('free-hall')).toMatchObject({ setupMinutes: 20, turnaroundMinutes: 25 })
  })

  it('spm72_api_only_venue_staff_can_set_the_times', async () => {
    const before = structuredClone(stored('free-hall'))
    const venuesBefore = db.collectionData('venues').size

    for (const user of [users.coordinator, users.organiser, users.technicalStaff, users.attendee]) {
      const edited = await requestJson('/api/venues/free-hall', {
        method: 'PATCH',
        uid: user.uid,
        body: { ...catalogueInput, setupMinutes: 99, turnaroundMinutes: 99 },
      })
      const created = await requestJson('/api/venues', {
        method: 'POST',
        uid: user.uid,
        body: { name: 'Not Allowed', ...catalogueInput, setupMinutes: 5, turnaroundMinutes: 5 },
      })
      expect(edited.status).toBe(403)
      expect(created.status).toBe(403)
    }

    expect(stored('free-hall')).toEqual(before)
    expect(activity('free-hall')).toEqual([])
    expect(db.collectionData('venues').size).toBe(venuesBefore)
  })
})
