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

export const MAINTENANCE_BLOCK_REASONS = Object.freeze([
  'maintenance',
  'renovation',
  'safety',
  'internal_activity',
  'other',
])

export const REMOVED_STATUSES = new Set(['cancelled', 'removed'])

// SPM-16 — how long a new tentative hold lasts unless it is confirmed (Week 7 Change #4). Seven days is a
// team default of 15 Oct 2026, retained by SPM-78.
export const TENTATIVE_HOLD_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export function tentativeHoldExpiresAt(createdAt) {
  return new Date(createdAt.getTime() + TENTATIVE_HOLD_DURATION_MS).toISOString()
}

// A tentative hold has expired once its holdExpiresAt is reached. Holds saved before SPM-16 have no
// holdExpiresAt and still count as active. Conflict detection (SPM-16), venue search (SPM-75) and
// suitability (SPM-13) and the availability calendar (SPM-78) apply this.
export function isExpiredHold(commitment, now = new Date()) {
  return (
    commitment.status === AVAILABILITY_STATUS.TENTATIVE_HOLD &&
    typeof commitment.holdExpiresAt === 'string' &&
    Date.parse(commitment.holdExpiresAt) <= now.getTime()
  )
}

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

export function normaliseMaintenanceBlockInput(input) {
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : ''
  const { commitment, errors } = normaliseAvailabilityCommitment({
    ...input,
    status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
  })

  if (!MAINTENANCE_BLOCK_REASONS.includes(reason)) {
    errors.reason = 'Reason must be maintenance, renovation, safety, internal_activity, or other.'
  }

  return {
    block: {
      ...commitment,
      reason,
      title: commitment.title || maintenanceBlockTitle(reason),
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

function maintenanceBlockTitle(reason) {
  if (reason === 'internal_activity') return 'Internal activity'
  return reason ? reason[0].toUpperCase() + reason.slice(1) : ''
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
