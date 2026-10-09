export const AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE: 'available',
  CONFIRMED_BOOKING: 'confirmed_booking',
  TENTATIVE_HOLD: 'tentative_hold',
  MAINTENANCE_BLOCK: 'maintenance_block',
})

export const ACTIVE_COMMITMENT_STATUSES = Object.freeze([
  AVAILABILITY_STATUS.CONFIRMED_BOOKING,
  AVAILABILITY_STATUS.TENTATIVE_HOLD,
  AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
])

const REMOVED_STATUSES = new Set(['cancelled', 'removed'])

export function validateAvailabilityRange({ from, to }) {
  const errors = {}
  const fromDate = parseIsoDate(from)
  const toDate = parseIsoDate(to)

  if (!fromDate) errors.from = 'A valid start date/time is required.'
  if (!toDate) errors.to = 'A valid end date/time is required.'
  if (fromDate && toDate && fromDate >= toDate) errors.to = 'End date/time must be after start date/time.'

  return { from: fromDate, to: toDate, errors }
}

export function normaliseAvailabilityCommitment(input) {
  const errors = {}
  const status = typeof input?.status === 'string' ? input.status.trim() : ''
  const venueId = typeof input?.venueId === 'string' ? input.venueId.trim() : ''
  const eventRequestId = typeof input?.eventRequestId === 'string' ? input.eventRequestId.trim() : null
  const { from, to, errors: rangeErrors } = validateAvailabilityRange({ from: input?.startsAt, to: input?.endsAt })

  if (!venueId) errors.venueId = 'Venue is required.'
  if (!ACTIVE_COMMITMENT_STATUSES.includes(status)) errors.status = 'A valid availability status is required.'
  Object.assign(errors, rangeErrors)

  return {
    commitment: {
      venueId,
      status,
      eventRequestId,
      startsAt: from?.toISOString() ?? null,
      endsAt: to?.toISOString() ?? null,
      title: typeof input?.title === 'string' ? input.title.trim() : '',
    },
    errors,
  }
}

export function overlaps(left, right) {
  const leftStart = Date.parse(left.startsAt)
  const leftEnd = Date.parse(left.endsAt)
  const rightStart = Date.parse(right.startsAt)
  const rightEnd = Date.parse(right.endsAt)

  return leftStart < rightEnd && rightStart < leftEnd
}

export function activeCommitmentsInRange(commitments, range) {
  return commitments
    .filter((commitment) => !REMOVED_STATUSES.has(commitment.lifecycleStatus))
    .filter((commitment) => ACTIVE_COMMITMENT_STATUSES.includes(commitment.status))
    .filter((commitment) => overlaps(commitment, { startsAt: range.from.toISOString(), endsAt: range.to.toISOString() }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.endsAt.localeCompare(right.endsAt))
}

export function buildAvailabilityResponse(commitments, range) {
  const busySlots = activeCommitmentsInRange(commitments, range).map((commitment) => {
    const startsAt = new Date(Math.max(Date.parse(commitment.startsAt), range.from.getTime())).toISOString()
    const endsAt = new Date(Math.min(Date.parse(commitment.endsAt), range.to.getTime())).toISOString()

    return {
      id: commitment.id,
      venueId: commitment.venueId,
      status: commitment.status,
      startsAt,
      endsAt,
      title: commitment.title || null,
      eventRequestId: commitment.eventRequestId ?? null,
    }
  })

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    slots: fillAvailableSlots(busySlots, range),
  }
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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
