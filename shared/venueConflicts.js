// SPM-16 — booking conflict detection for one venue (Week 7 Change #1, CL3 G8!C5).
//
// A proposed booking or hold conflicts with an active confirmed booking, unexpired tentative hold or
// maintenance block at the same venue when their periods overlap by any amount; there is no override.
// Bookings and holds are compared on their occupied periods (start − setup to end + turnaround, with the
// venue's current times on both sides). Maintenance blocks are compared on their own period, without
// setup or turnaround (team decision, 15 Oct 2026). A later booking's setup may start exactly when an
// earlier booking's turnaround ends. Each venue is checked on its own, so an event using several venues
// gets one check per venue (Change #3).

import { AVAILABILITY_STATUS, activeCommitmentsInRange, isExpiredHold, overlaps } from './venueAvailability.js'
import { occupiedPeriod, venueBufferMinutes } from './venueOccupancy.js'

const MINUTE_MS = 60 * 1000

/**
 * The earliest commitment that the proposed `candidate` ({ venueId, startsAt, endsAt }) conflicts with,
 * as { id, status, startsAt, endsAt, occupiedStartsAt, occupiedEndsAt }, or null when there is none.
 * `venue` is the candidate's venue record; `commitments` its venueAvailability entries.
 */
export function findVenueConflict({ candidate, venue, commitments, now = new Date() }) {
  const occupied = occupiedPeriod(candidate, venue)
  const { setupMinutes, turnaroundMinutes } = venueBufferMinutes(venue)

  // A booking's raw period overlaps this wider range exactly when its occupied period overlaps the
  // candidate's, so activeCommitmentsInRange can do the status and lifecycle filtering. It also returns
  // every maintenance block that could overlap; the exact check follows.
  const searchRange = {
    from: new Date(Date.parse(occupied.startsAt) - turnaroundMinutes * MINUTE_MS),
    to: new Date(Date.parse(occupied.endsAt) + setupMinutes * MINUTE_MS),
  }
  const sameVenue = commitments.filter((commitment) => commitment.venueId === candidate.venueId)

  const conflict = activeCommitmentsInRange(sameVenue, searchRange)
    .filter((commitment) => !isExpiredHold(commitment, now))
    .map((commitment) => ({ commitment, period: periodOf(commitment, venue) }))
    .find(({ period }) => overlaps(period, occupied))

  if (!conflict) return null
  return {
    id: conflict.commitment.id ?? null,
    status: conflict.commitment.status,
    startsAt: conflict.commitment.startsAt,
    endsAt: conflict.commitment.endsAt,
    occupiedStartsAt: conflict.period.startsAt,
    occupiedEndsAt: conflict.period.endsAt,
  }
}

function periodOf(commitment, venue) {
  if (commitment.status === AVAILABILITY_STATUS.MAINTENANCE_BLOCK) {
    return { startsAt: commitment.startsAt, endsAt: commitment.endsAt }
  }
  return occupiedPeriod(commitment, venue)
}
