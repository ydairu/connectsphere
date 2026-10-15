// SPM-16 — proves, offline, that the seeded venues can demonstrate conflict detection: one venue with
// setup and turnaround times holds a confirmed booking, an active tentative hold and an expired one.

import { describe, expect, it } from 'vitest'

import {
  SEED_ID_PREFIX,
  SEED_REQUESTS,
  SEED_VENUE_AVAILABILITY,
  SEED_VENUES,
  seedEventPeriod,
} from '../../../backend/scripts/seedData.js'
import { PLANNING } from '../../../shared/status.js'
import { normaliseVenueInput } from '../../../shared/venue.js'
import { AVAILABILITY_STATUS, isExpiredHold } from '../../../shared/venueAvailability.js'
import { findVenueConflict } from '../../../shared/venueConflicts.js'
import { hasConfirmedBooking } from '../../../shared/venueOccupancy.js'

// The day of this change; the active hold must still be active on it.
const DEMO_NOW = new Date('2026-10-15T00:00:00.000Z')
const [hall, room] = SEED_VENUES
const byId = Object.fromEntries(SEED_VENUE_AVAILABILITY.map((entry) => [entry.id, entry]))
const requestsById = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))

function conflictAtHall(startsAt, endsAt) {
  return findVenueConflict({ candidate: { venueId: hall.id, startsAt, endsAt }, venue: hall, commitments: SEED_VENUE_AVAILABILITY, now: DEMO_NOW })
}

describe('Seed data — SPM-16 venue conflict demonstration', () => {
  it('spm16_seed_venues_are_valid_catalogue_venues_with_seed_ids', () => {
    for (const venue of SEED_VENUES) {
      expect(venue.id.startsWith(SEED_ID_PREFIX)).toBe(true)
      expect(normaliseVenueInput(venue).errors).toEqual({})
    }
    expect([hall.setupMinutes, hall.turnaroundMinutes]).toEqual([30, 45])
    expect([room.setupMinutes, room.turnaroundMinutes]).toEqual([0, 0])
  })

  it('spm16_seed_hall_has_a_confirmed_booking_an_active_hold_and_an_expired_hold', () => {
    const atHall = SEED_VENUE_AVAILABILITY.filter((entry) => entry.venueId === hall.id)
    const holds = atHall.filter((entry) => entry.status === AVAILABILITY_STATUS.TENTATIVE_HOLD)
    expect(atHall.some((entry) => entry.status === AVAILABILITY_STATUS.CONFIRMED_BOOKING)).toBe(true)
    expect(holds.filter((entry) => !isExpiredHold(entry, DEMO_NOW))).toHaveLength(1)
    expect(holds.filter((entry) => isExpiredHold(entry, DEMO_NOW))).toHaveLength(1)
    expect(hasConfirmedBooking(atHall, DEMO_NOW)).toBe(true)
    expect(SEED_VENUE_AVAILABILITY.every((entry) => entry.id.startsWith(SEED_ID_PREFIX))).toBe(true)
  })

  it('spm16_seed_booking_uses_the_confirmed_event_s_own_date_and_time', () => {
    const booking = byId['seed-availability-a1-confirmed-booking']
    expect(booking.eventRequestId).toBe('seed-req-a1-confirmed')
    expect({ startsAt: booking.startsAt, endsAt: booking.endsAt }).toEqual({ startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z' })
    expect(booking.startsAt).toBe(new Date(requestsById['seed-req-a1-confirmed'].core.preferredDateTime).toISOString())
  })

  it('spm16_seed_active_hold_belongs_to_a_planning_event_at_its_own_date_and_time', () => {
    const hold = byId['seed-availability-b1-planning-hold']
    expect(requestsById[hold.eventRequestId].status).toBe(PLANNING)
    expect({ startsAt: hold.startsAt, endsAt: hold.endsAt }).toEqual(seedEventPeriod('b1-planning'))
  })

  it('spm16_seed_entries_do_not_conflict_with_one_another', () => {
    const active = SEED_VENUE_AVAILABILITY.filter((entry) => !isExpiredHold(entry, DEMO_NOW))
    for (const entry of active) {
      const others = SEED_VENUE_AVAILABILITY.filter((other) => other.id !== entry.id)
      expect(findVenueConflict({ candidate: entry, venue: hall, commitments: others, now: DEMO_NOW }), entry.id).toBeNull()
    }
  })

  it('spm16_seed_demonstrates_the_rule_at_the_hall', () => {
    const booking = byId['seed-availability-a1-confirmed-booking']
    const bookingEnd = Date.parse(booking.endsAt)
    const minutes = (count) => count * 60 * 1000
    // Turnaround runs 45 minutes past the booking's end, and setup takes 30 minutes before the next start.
    expect(conflictAtHall(new Date(bookingEnd + minutes(30)).toISOString(), new Date(bookingEnd + minutes(120)).toISOString())).toMatchObject({ id: booking.id })
    expect(conflictAtHall(new Date(bookingEnd + minutes(75)).toISOString(), new Date(bookingEnd + minutes(120)).toISOString())).toBeNull()

    const hold = byId['seed-availability-b1-planning-hold']
    expect(conflictAtHall(hold.startsAt, hold.endsAt)).toMatchObject({ id: hold.id, status: AVAILABILITY_STATUS.TENTATIVE_HOLD })

    const expired = byId['seed-availability-expired-hold']
    expect(conflictAtHall(expired.startsAt, expired.endsAt)).toBeNull()
  })
})
