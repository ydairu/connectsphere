// SPM-72 — a venue's setup and turnaround time, and the period a booking really occupies it
// (Week 7 Change 1). Conflict detection (SPM-16), the availability calendar (SPM-73) and venue search
// (SPM-75) are expected to use occupiedPeriod rather than add the minutes themselves.

import { AVAILABILITY_STATUS, REMOVED_STATUSES } from './venueAvailability.js'

const MINUTE_MS = 60 * 1000

// Venues created before SPM-72 have neither field; they are read as 0 (AC1).
export function venueBufferMinutes(venue) {
  return {
    setupMinutes: venue?.setupMinutes ?? 0,
    turnaroundMinutes: venue?.turnaroundMinutes ?? 0,
  }
}

// The venue is occupied from the start of setup to the end of turnaround: an event from 10:00 to
// 12:00 with 30 minutes' setup and 45 minutes' turnaround occupies 09:30 to 12:45.
export function occupiedPeriod({ startsAt, endsAt }, venue) {
  const { setupMinutes, turnaroundMinutes } = venueBufferMinutes(venue)
  return {
    startsAt: new Date(Date.parse(startsAt) - setupMinutes * MINUTE_MS).toISOString(),
    endsAt: new Date(Date.parse(endsAt) + turnaroundMinutes * MINUTE_MS).toISOString(),
  }
}

// AC5: setup and turnaround are locked while the venue has a confirmed booking that has not ended
// (team decision, 15 Oct 2026). Tentative holds, maintenance blocks and removed bookings do not lock.
export function hasConfirmedBooking(commitments, now = new Date()) {
  return commitments.some(
    (commitment) =>
      commitment.status === AVAILABILITY_STATUS.CONFIRMED_BOOKING &&
      !REMOVED_STATUSES.has(commitment.lifecycleStatus) &&
      Date.parse(commitment.endsAt) > now.getTime(),
  )
}
