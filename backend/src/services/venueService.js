import { buildVenueRecord, hasVenueValidationErrors, normaliseVenueInput } from '../../../shared/venue.js'
import {
  AVAILABILITY_STATUS,
  normaliseAvailabilityCommitment,
  normaliseMaintenanceBlockInput,
  tentativeHoldExpiresAt,
  validateAvailabilityRange,
} from '../../../shared/venueAvailability.js'
import { findVenueConflict } from '../../../shared/venueConflicts.js'
import { buildVenueFilterOptions, normaliseVenueSearchQuery, venueAvailableFor, venueMatchesFilters } from '../../../shared/venueSearch.js'
import { hasConfirmedBooking, venueBufferMinutes } from '../../../shared/venueOccupancy.js'
import { buildVenueCalendar } from '../../../shared/venueCalendar.js'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

export const VENUE_FIELD_CHANGED = 'venue_field_changed'

const CATALOGUE_FIELDS = [
  'name',
  'location',
  'maximumCapacity',
  'facilities',
  'accessibilityFeatures',
  'supportedLayouts',
  'operatingHours',
]
// SPM-72: setup and turnaround are edited and recorded like the catalogue fields, but are not part of
// the catalogue list.
const BUFFER_FIELDS = ['setupMinutes', 'turnaroundMinutes']
const EDITABLE_FIELDS = [...CATALOGUE_FIELDS.filter((field) => field !== 'name'), ...BUFFER_FIELDS]
const BUFFER_LOCKED_MESSAGES = {
  setupMinutes: 'Setup time cannot be changed while this venue has a confirmed booking.',
  turnaroundMinutes: 'Turnaround time cannot be changed while this venue has a confirmed booking.',
}

export class VenueValidationError extends Error {
  constructor(errors) {
    super('Venue validation failed.')
    this.name = 'VenueValidationError'
    this.errors = errors
  }
}

export class VenueNotFoundError extends Error {
  constructor(id) {
    super(`Venue ${id} was not found.`)
    this.name = 'VenueNotFoundError'
    this.id = id
  }
}

export class VenueBufferTimesLockedError extends Error {
  constructor(errors) {
    super('Venue setup and turnaround times are locked by a confirmed booking.')
    this.name = 'VenueBufferTimesLockedError'
    this.errors = errors
  }
}

const CONFLICT_LABELS = {
  [AVAILABILITY_STATUS.CONFIRMED_BOOKING]: 'a confirmed booking',
  [AVAILABILITY_STATUS.TENTATIVE_HOLD]: 'a tentative hold',
  [AVAILABILITY_STATUS.MAINTENANCE_BLOCK]: 'a maintenance block',
}

// SPM-16: the proposed period overlaps an existing commitment at the venue. `conflict` names its type and
// period only, never its event or title, so a caller cannot learn about another organisation's event.
export class VenueConflictError extends Error {
  constructor(conflict) {
    super('The venue is not available for that period.')
    this.name = 'VenueConflictError'
    this.conflict = {
      status: conflict.status,
      startsAt: conflict.startsAt,
      endsAt: conflict.endsAt,
      occupiedStartsAt: conflict.occupiedStartsAt,
      occupiedEndsAt: conflict.occupiedEndsAt,
    }
    this.errors = {
      time: `This venue has ${CONFLICT_LABELS[conflict.status]} occupying it from ${conflict.occupiedStartsAt} to ${conflict.occupiedEndsAt}.`,
    }
  }
}

export class VenueAvailabilityBlockNotFoundError extends Error {
  constructor(id) {
    super(`Maintenance block ${id} was not found.`)
    this.name = 'VenueAvailabilityBlockNotFoundError'
    this.id = id
  }
}

export async function createVenue(input, venueStaff, db = getAdminDb()) {
  const { venue, errors } = buildVenueRecord(input, venueStaff)
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const docRef = await db.collection('venues').add(venue)
  return { id: docRef.id, ...venue }
}

// SPM-12: every search filter is optional and a venue must meet all of those applied. The filter
// options always describe the whole catalogue, whatever the search.
// SPM-75: a date/time search uses SPM-16's conflict rule, so it counts setup and turnaround and ignores
// expired holds, as a booking request for that period would.
export async function listVenues(query = {}, db = getAdminDb(), now = new Date()) {
  const snapshot = await db.collection('venues').get()
  const records = new Map(snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]))
  const catalogue = [...records.values()]
    .map(projectVenueCatalogueItem)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  const filterOptions = buildVenueFilterOptions(catalogue)

  const { filters, errors } = normaliseVenueSearchQuery(query)
  const range =
    query?.availableFrom || query?.availableTo
      ? validateAvailabilityRange({ from: query?.availableFrom, to: query?.availableTo })
      : null
  if (range) Object.assign(errors, range.errors)
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const venues = catalogue.filter((venue) => venueMatchesFilters(venue, filters))
  if (!range || venues.length === 0) return { venues, filterOptions }

  const availabilitySnapshot = await db.collection('venueAvailability').get()
  const commitmentsByVenue = new Map()
  for (const doc of availabilitySnapshot.docs) {
    const commitment = { id: doc.id, ...doc.data() }
    if (!commitmentsByVenue.has(commitment.venueId)) commitmentsByVenue.set(commitment.venueId, [])
    commitmentsByVenue.get(commitment.venueId).push(commitment)
  }
  const period = { startsAt: range.from.toISOString(), endsAt: range.to.toISOString() }

  return {
    venues: venues.filter((venue) => venueAvailableFor(records.get(venue.id), commitmentsByVenue.get(venue.id) ?? [], period, now)),
    filterOptions,
  }
}

export async function getVenue(id, db = getAdminDb()) {
  const snapshot = await db.collection('venues').doc(id).get()
  if (!snapshot.exists) throw new VenueNotFoundError(id)
  return { id: snapshot.id, ...snapshot.data() }
}

// The venue as the detail and edit pages show it: setup and turnaround default to 0, and
// bufferTimesLocked tells the edit page that a confirmed booking prevents changing them (SPM-72 AC5).
export async function getVenueDetails(id, db = getAdminDb(), now = new Date()) {
  const venue = await getVenue(id, db)
  const snapshot = await db.collection('venueAvailability').where('venueId', '==', id).get()
  const commitments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

  return { ...venue, ...venueBufferMinutes(venue), bufferTimesLocked: hasConfirmedBooking(commitments, now) }
}

export async function updateVenue(id, input, venueStaff, db = getAdminDb(), now = new Date()) {
  const docRef = db.collection('venues').doc(id)
  const at = now.toISOString()

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new VenueNotFoundError(id)

    const existing = snapshot.data()
    const savedBufferMinutes = venueBufferMinutes(existing)
    // Setup and turnaround left out of the request keep their saved values, so an edit that does not
    // send them cannot reset them to 0.
    const { venue, errors } = normaliseVenueInput({ ...savedBufferMinutes, ...input, name: existing.name })
    if (!venueStaff?.uid) errors.updatedByUid = 'An authenticated Venue Staff member is required.'
    if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

    // SPM-72 AC5: checked inside the transaction, so a booking confirmed during the edit still blocks it.
    const changedBufferFields = BUFFER_FIELDS.filter((field) => venue[field] !== savedBufferMinutes[field])
    if (changedBufferFields.length > 0) {
      const availability = await tx.get(db.collection('venueAvailability').where('venueId', '==', id))
      const commitments = availability.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      if (hasConfirmedBooking(commitments, now)) {
        throw new VenueBufferTimesLockedError(
          Object.fromEntries(changedBufferFields.map((field) => [field, BUFFER_LOCKED_MESSAGES[field]])),
        )
      }
    }

    const update = {
      location: venue.location,
      maximumCapacity: venue.maximumCapacity,
      facilities: venue.facilities,
      accessibilityFeatures: venue.accessibilityFeatures,
      supportedLayouts: venue.supportedLayouts,
      operatingHours: venue.operatingHours,
      setupMinutes: venue.setupMinutes,
      turnaroundMinutes: venue.turnaroundMinutes,
      updatedByUid: venueStaff.uid,
      updatedByName: venueStaff.name ?? venueStaff.email ?? null,
      updatedAt: at,
    }
    // Compared with the defaulted times, so a venue created before SPM-72 does not record a change
    // from nothing to 0.
    const changedFields = venueFieldChanges({ ...existing, ...savedBufferMinutes }, update)

    tx.update(docRef, update)
    for (const change of changedFields) {
      tx.set(docRef.collection('activity').doc(), {
        type: VENUE_FIELD_CHANGED,
        ...change,
        actor: {
          type: 'user',
          uid: venueStaff.uid,
          name: venueStaff.name ?? null,
          role: VENUE_STAFF,
        },
        at,
      })
    }

    return { id, ...existing, ...update }
  })
}

// SPM-11 calendar; SPM-73 adds each booking's and hold's setup and turnaround, from the venue's times.
export async function listVenueAvailability(venueId, query, db = getAdminDb()) {
  const venue = await getVenue(venueId, db)

  const range = validateAvailabilityRange({ from: query?.from, to: query?.to })
  if (hasVenueValidationErrors(range.errors)) throw new VenueValidationError(range.errors)

  const snapshot = await db.collection('venueAvailability').where('venueId', '==', venueId).get()
  const commitments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

  return buildVenueCalendar(commitments, range, venue)
}

// SPM-16: one lock document per venue. Every hold or booking for the venue reads and writes it in its
// transaction, so overlapping requests are serialised (as SPM-8's systemLocks/coordinatorAssignment) and
// the later one sees the earlier one's commitment: first come, first served.
export function venueBookingLockPath(venueId) {
  return ['systemLocks', `venueBooking-${venueId}`]
}

// Read-only transaction phase shared by SPM-14 and the standalone SPM-16 hold service.
// Only a caller that has verified the replacement/approval hold's association may pass excludeId.
export async function checkVenueHoldInTransaction(tx, db, commitment, now, excludeId = null) {
  const venueSnapshot = await tx.get(db.collection('venues').doc(commitment.venueId))
  if (!venueSnapshot.exists) throw new VenueNotFoundError(commitment.venueId)
  const [collection, id] = venueBookingLockPath(commitment.venueId)
  const lockRef = db.collection(collection).doc(id)
  await tx.get(lockRef)
  const availability = await tx.get(db.collection('venueAvailability').where('venueId', '==', commitment.venueId))
  const conflict = findVenueConflict({ candidate: commitment, venue: venueSnapshot.data(),
    commitments: availability.docs.filter((doc) => doc.id !== excludeId).map((doc) => ({ id: doc.id, ...doc.data() })), now })
  if (conflict) throw new VenueConflictError(conflict)
  return { venue: venueSnapshot.data(), lockRef }
}

// SPM-16: places a tentative hold unless its occupied period conflicts with an active booking, unexpired
// hold or maintenance block at the venue; a conflict throws VenueConflictError and writes nothing. No
// route calls this yet — SPM-14 (booking request) is expected to.
export async function createTentativeVenueHold(input, actor, db = getAdminDb(), now = new Date()) {
  const { commitment, errors } = normaliseAvailabilityCommitment({
    ...input,
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
  })
  if (!actor?.uid) errors.createdByUid = 'An authenticated staff member is required.'
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const docRef = db.collection('venueAvailability').doc()
  const at = now.toISOString()
  const record = {
    ...commitment,
    lifecycleStatus: 'active',
    holdExpiresAt: tentativeHoldExpiresAt(now),
    createdByUid: actor.uid,
    createdByName: actor.name ?? actor.email ?? null,
    createdAt: at,
  }

  await db.runTransaction(async (tx) => {
    const { lockRef } = await checkVenueHoldInTransaction(tx, db, commitment, now)

    tx.set(docRef, record)
    tx.set(lockRef, { venueId: commitment.venueId, lastCommitmentId: docRef.id, updatedAt: at })
  })

  return { id: docRef.id, ...record }
}

export async function createMaintenanceBlock(venueId, input, venueStaff, db = getAdminDb(), now = new Date()) {
  await getVenue(venueId, db)

  const { block, errors } = normaliseMaintenanceBlockInput({ ...input, venueId })
  if (!venueStaff?.uid) errors.createdByUid = 'An authenticated Venue Staff member is required.'
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const record = {
    ...block,
    lifecycleStatus: 'active',
    createdByUid: venueStaff.uid,
    createdByName: venueStaff.name ?? venueStaff.email ?? null,
    createdAt: now.toISOString(),
    updatedByUid: venueStaff.uid,
    updatedByName: venueStaff.name ?? venueStaff.email ?? null,
    updatedAt: now.toISOString(),
  }
  const docRef = await db.collection('venueAvailability').add(record)
  return { id: docRef.id, ...record }
}

export async function updateMaintenanceBlock(venueId, blockId, input, venueStaff, db = getAdminDb(), now = new Date()) {
  await getVenue(venueId, db)

  const docRef = db.collection('venueAvailability').doc(blockId)
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new VenueAvailabilityBlockNotFoundError(blockId)

    const existing = snapshot.data()
    if (existing.venueId !== venueId || existing.status !== AVAILABILITY_STATUS.MAINTENANCE_BLOCK) {
      throw new VenueAvailabilityBlockNotFoundError(blockId)
    }

    const { block, errors } = normaliseMaintenanceBlockInput({ ...input, venueId })
    if (!venueStaff?.uid) errors.updatedByUid = 'An authenticated Venue Staff member is required.'
    if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

    const update = {
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
      title: block.title,
      lifecycleStatus: 'active',
      updatedByUid: venueStaff.uid,
      updatedByName: venueStaff.name ?? venueStaff.email ?? null,
      updatedAt: now.toISOString(),
    }

    tx.update(docRef, update)
    return { id: blockId, ...existing, ...update }
  })
}

export async function removeMaintenanceBlock(venueId, blockId, venueStaff, db = getAdminDb(), now = new Date()) {
  await getVenue(venueId, db)

  const docRef = db.collection('venueAvailability').doc(blockId)
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new VenueAvailabilityBlockNotFoundError(blockId)

    const existing = snapshot.data()
    if (existing.venueId !== venueId || existing.status !== AVAILABILITY_STATUS.MAINTENANCE_BLOCK) {
      throw new VenueAvailabilityBlockNotFoundError(blockId)
    }

    if (!venueStaff?.uid) {
      throw new VenueValidationError({ removedByUid: 'An authenticated Venue Staff member is required.' })
    }

    const update = {
      lifecycleStatus: 'removed',
      removedByUid: venueStaff.uid,
      removedByName: venueStaff.name ?? venueStaff.email ?? null,
      removedAt: now.toISOString(),
      updatedByUid: venueStaff.uid,
      updatedByName: venueStaff.name ?? venueStaff.email ?? null,
      updatedAt: now.toISOString(),
    }

    tx.update(docRef, update)
    return { id: blockId, ...existing, ...update }
  })
}

function projectVenueCatalogueItem(venue) {
  const item = { id: venue.id }
  for (const field of CATALOGUE_FIELDS) item[field] = venue[field]
  return item
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function venueFieldChanges(existing, update) {
  return EDITABLE_FIELDS.filter((field) => !sameValue(existing[field], update[field])).map((field) => ({
    field,
    oldValue: existing[field] ?? null,
    newValue: update[field] ?? null,
  }))
}
