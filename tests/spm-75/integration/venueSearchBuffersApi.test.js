// SPM-75 — GET /api/venues date/time search counts setup and turnaround and ignores expired holds.
// Real Express routing and middleware, mocked token verification, in-memory Firestore.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { COORDINATOR } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'

const TOKEN_PREFIX = 'test-token:'
const coordinator = { uid: 'coordinator-1', name: 'Coordinator One', roles: [COORDINATOR] }

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return uid === coordinator.uid ? coordinator : null
  },
})

function venue(name, overrides = {}) {
  return {
    name,
    location: 'Main Campus',
    maximumCapacity: 100,
    facilities: ['Projector'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Theatre'],
    operatingHours: 'Daily 08:00-22:00',
    createdByUid: 'seed',
    ...overrides,
  }
}

// Monday 2 Nov 2026, Singapore time. Every venue except Legacy Hall and Free Hall has something at 10:00–12:00.
const db = createFakeFirestore({
  venues: {
    'turnaround-hall': venue('Turnaround Hall', { setupMinutes: 0, turnaroundMinutes: 45 }),
    'setup-hall': venue('Setup Hall', { setupMinutes: 30, turnaroundMinutes: 0 }),
    'buffered-hall': venue('Buffered Hall', { setupMinutes: 30, turnaroundMinutes: 45, maximumCapacity: 300 }),
    'expired-hold-hall': venue('Expired Hold Hall', { setupMinutes: 0, turnaroundMinutes: 0 }),
    'held-hall': venue('Held Hall', { setupMinutes: 0, turnaroundMinutes: 0 }),
    // Created before SPM-72: no setup or turnaround stored.
    'legacy-hall': venue('Legacy Hall'),
  },
  venueAvailability: {
    'turnaround-booking': {
      venueId: 'turnaround-hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T10:00:00+08:00',
      endsAt: '2026-11-02T12:00:00+08:00',
    },
    'setup-booking': {
      venueId: 'setup-hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T14:00:00+08:00',
      endsAt: '2026-11-02T16:00:00+08:00',
    },
    'buffered-booking': {
      venueId: 'buffered-hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T10:00:00+08:00',
      endsAt: '2026-11-02T12:00:00+08:00',
    },
    'expired-hold': {
      venueId: 'expired-hold-hall',
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
      lifecycleStatus: 'active',
      holdExpiresAt: '2026-01-01T00:00:00.000Z',
      startsAt: '2026-11-02T10:00:00+08:00',
      endsAt: '2026-11-02T12:00:00+08:00',
    },
    'unexpired-hold': {
      venueId: 'held-hall',
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
      lifecycleStatus: 'active',
      holdExpiresAt: '2099-01-01T00:00:00.000Z',
      startsAt: '2026-11-02T10:00:00+08:00',
      endsAt: '2026-11-02T12:00:00+08:00',
    },
    'legacy-booking': {
      venueId: 'legacy-hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T10:00:00+08:00',
      endsAt: '2026-11-02T12:00:00+08:00',
    },
  },
})

let server
let baseUrl

beforeAll(async () => {
  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function availableBetween(from, to, extra = []) {
  const search = new URLSearchParams([['availableFrom', from], ['availableTo', to], ...extra])
  const response = await fetch(`${baseUrl}/api/venues?${search}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${coordinator.uid}` },
  })
  const json = await response.json()
  return { status: response.status, ids: (json.venues ?? []).map((item) => item.id) }
}

describe('SPM-75 — buffer-aware venue search API (integration)', () => {
  it('spm75_api_ac1_excludes_a_venue_still_in_turnaround_at_the_search_start', async () => {
    const response = await availableBetween('2026-11-02T12:30:00+08:00', '2026-11-02T14:00:00+08:00')

    expect(response.status).toBe(200)
    expect(response.ids).not.toContain('turnaround-hall')
  })

  it('spm75_api_ac2_includes_the_venue_once_its_turnaround_has_ended', async () => {
    const response = await availableBetween('2026-11-02T12:45:00+08:00', '2026-11-02T14:00:00+08:00')

    expect(response.ids).toContain('turnaround-hall')
  })

  it('spm75_api_ac3_excludes_a_venue_when_the_search_only_overlaps_a_bookings_setup_time', async () => {
    const intoSetup = await availableBetween('2026-11-02T12:00:00+08:00', '2026-11-02T13:45:00+08:00')
    const beforeSetup = await availableBetween('2026-11-02T12:00:00+08:00', '2026-11-02T13:30:00+08:00')

    expect(intoSetup.ids).not.toContain('setup-hall')
    expect(beforeSetup.ids).toContain('setup-hall')
  })

  it('spm75_api_ac4_an_expired_tentative_hold_does_not_exclude_the_venue', async () => {
    const response = await availableBetween('2026-11-02T10:30:00+08:00', '2026-11-02T11:30:00+08:00')

    expect(response.ids).toContain('expired-hold-hall')
    expect(response.ids).not.toContain('held-hall')
  })

  it('spm75_api_counts_the_searched_venues_own_setup_like_a_booking_request', async () => {
    const tooEarly = await availableBetween('2026-11-02T12:45:00+08:00', '2026-11-02T14:00:00+08:00')
    const later = await availableBetween('2026-11-02T13:15:00+08:00', '2026-11-02T14:00:00+08:00')

    expect(tooEarly.ids).not.toContain('buffered-hall')
    expect(later.ids).toContain('buffered-hall')
  })

  it('spm75_api_a_venue_without_stored_times_is_searched_on_raw_times_as_before', async () => {
    const atEnd = await availableBetween('2026-11-02T12:00:00+08:00', '2026-11-02T13:00:00+08:00')
    const during = await availableBetween('2026-11-02T11:59:00+08:00', '2026-11-02T13:00:00+08:00')

    expect(atEnd.ids).toContain('legacy-hall')
    expect(during.ids).not.toContain('legacy-hall')
  })

  it('spm75_api_still_combines_with_the_spm12_filters', async () => {
    const response = await availableBetween('2026-11-02T13:15:00+08:00', '2026-11-02T14:00:00+08:00', [['attendance', '200']])

    expect(response.ids).toEqual(['buffered-hall'])
  })
})
