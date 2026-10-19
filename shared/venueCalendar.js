// SPM-73 — the venue availability calendar (SPM-11) with each booking's and tentative hold's setup and
// turnaround shown as their own slots (Week 7 Change 1). The venue is occupied from the start of setup to
// the end of turnaround (shared/venueOccupancy.js), so those minutes are never shown as available.
// Maintenance blocks have no setup or turnaround (SPM-16 team decision, 15 Oct 2026).
//
// Kept apart from shared/venueAvailability.js because venueOccupancy.js already imports that module.
// SPM-78 excludes expired holds and their setup/turnaround slots at read time.

import { AVAILABILITY_STATUS, activeCommitmentsInRange, isExpiredHold } from './venueAvailability.js'
import { occupiedPeriod, venueBufferMinutes } from './venueOccupancy.js'

// Slot statuses for the calendar only: never stored as a commitment's status.
export const SETUP_SLOT = 'setup'
export const TURNAROUND_SLOT = 'turnaround'

const MINUTE_MS = 60 * 1000

function commitmentSlot(commitment) {
  return {
    id: commitment.id,
    venueId: commitment.venueId,
    status: commitment.status,
    startsAt: commitment.startsAt,
    endsAt: commitment.endsAt,
    title: commitment.title || null,
    reason: commitment.reason ?? null,
    eventRequestId: commitment.eventRequestId ?? null,
  }
}

// A setup or turnaround slot names the booking or hold it belongs to.
function bufferSlot(status, commitment, startsAt, endsAt) {
  return {
    status,
    commitmentId: commitment.id ?? null,
    commitmentStatus: commitment.status,
    venueId: commitment.venueId,
    startsAt,
    endsAt,
    title: commitment.title || null,
  }
}

/** The slot cut to the calendar's range, or null when nothing of it falls inside. */
function clip(slot, range) {
  const start = Math.max(Date.parse(slot.startsAt), range.from.getTime())
  const end = Math.min(Date.parse(slot.endsAt), range.to.getTime())
  if (!(start < end)) return null
  return { ...slot, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }
}

/**
 * The calendar for one venue over `range` ({ from, to } Dates): { range, slots, buffers }. Slots run in
 * time order — confirmed bookings, tentative holds and maintenance blocks as stored, setup and turnaround
 * slots either side of each booking or hold, and available slots in the gaps. `venue` is the full venue
 * record; a venue without setup or turnaround times gets exactly the SPM-11 calendar.
 */
export function buildVenueCalendar(commitments, range, venue, now = new Date()) {
  const { setupMinutes, turnaroundMinutes } = venueBufferMinutes(venue)

  // Read wider than the range, so a booking just outside it still shows its setup or turnaround inside.
  const readRange = {
    from: new Date(range.from.getTime() - turnaroundMinutes * MINUTE_MS),
    to: new Date(range.to.getTime() + setupMinutes * MINUTE_MS),
  }

  const busySlots = []
  for (const commitment of activeCommitmentsInRange(commitments, readRange).filter((item) => !isExpiredHold(item, now))) {
    busySlots.push(commitmentSlot(commitment))
    if (commitment.status === AVAILABILITY_STATUS.MAINTENANCE_BLOCK) continue

    const occupied = occupiedPeriod(commitment, venue)
    if (setupMinutes > 0) busySlots.push(bufferSlot(SETUP_SLOT, commitment, occupied.startsAt, commitment.startsAt))
    if (turnaroundMinutes > 0) busySlots.push(bufferSlot(TURNAROUND_SLOT, commitment, commitment.endsAt, occupied.endsAt))
  }

  const slots = busySlots
    .map((slot) => clip(slot, range))
    .filter(Boolean)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.endsAt.localeCompare(right.endsAt))

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    slots: fillAvailableSlots(slots, range),
    buffers: { setupMinutes, turnaroundMinutes },
  }
}

function fillAvailableSlots(busySlots, range) {
  const slots = []
  let cursor = range.from.getTime()

  for (const busySlot of busySlots) {
    const busyStart = Date.parse(busySlot.startsAt)
    const busyEnd = Date.parse(busySlot.endsAt)
    if (cursor < busyStart) {
      slots.push({
        status: AVAILABILITY_STATUS.AVAILABLE,
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(busyStart).toISOString(),
      })
    }
    slots.push(busySlot)
    cursor = Math.max(cursor, busyEnd)
  }

  if (cursor < range.to.getTime()) {
    slots.push({
      status: AVAILABILITY_STATUS.AVAILABLE,
      startsAt: new Date(cursor).toISOString(),
      endsAt: range.to.toISOString(),
    })
  }

  return slots
}
