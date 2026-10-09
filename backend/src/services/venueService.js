import { buildVenueRecord, hasVenueValidationErrors, normaliseVenueInput } from '../../../shared/venue.js'
import {
  AVAILABILITY_STATUS,
  activeCommitmentsInRange,
  buildAvailabilityResponse,
  normaliseAvailabilityCommitment,
  overlaps,
  validateAvailabilityRange,
} from '../../../shared/venueAvailability.js'
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
const EDITABLE_FIELDS = CATALOGUE_FIELDS.filter((field) => field !== 'name')

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

export async function createVenue(input, venueStaff, db = getAdminDb()) {
  const { venue, errors } = buildVenueRecord(input, venueStaff)
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const docRef = await db.collection('venues').add(venue)
  return { id: docRef.id, ...venue }
}

export async function listVenues(db = getAdminDb()) {
  const snapshot = await db.collection('venues').get()
  return snapshot.docs
    .map((doc) => projectVenueCatalogueItem({ id: doc.id, ...doc.data() }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export async function getVenue(id, db = getAdminDb()) {
  const snapshot = await db.collection('venues').doc(id).get()
  if (!snapshot.exists) throw new VenueNotFoundError(id)
  return { id: snapshot.id, ...snapshot.data() }
}

export async function updateVenue(id, input, venueStaff, db = getAdminDb(), now = new Date()) {
  const docRef = db.collection('venues').doc(id)
  const at = now.toISOString()

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef)
    if (!snapshot.exists) throw new VenueNotFoundError(id)

    const existing = snapshot.data()
    const { venue, errors } = normaliseVenueInput({ ...input, name: existing.name })
    if (!venueStaff?.uid) errors.updatedByUid = 'An authenticated Venue Staff member is required.'
    if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

    const update = {
      location: venue.location,
      maximumCapacity: venue.maximumCapacity,
      facilities: venue.facilities,
      accessibilityFeatures: venue.accessibilityFeatures,
      supportedLayouts: venue.supportedLayouts,
      operatingHours: venue.operatingHours,
      updatedByUid: venueStaff.uid,
      updatedByName: venueStaff.name ?? venueStaff.email ?? null,
      updatedAt: at,
    }
    const changedFields = venueFieldChanges(existing, update)

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

export async function listVenueAvailability(venueId, query, db = getAdminDb()) {
  await getVenue(venueId, db)

  const range = validateAvailabilityRange({ from: query?.from, to: query?.to })
  if (hasVenueValidationErrors(range.errors)) throw new VenueValidationError(range.errors)

  const snapshot = await db.collection('venueAvailability').where('venueId', '==', venueId).get()
  const commitments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

  return buildAvailabilityResponse(commitments, range)
}

export async function createTentativeVenueHold(input, actor, db = getAdminDb()) {
  const { commitment, errors } = normaliseAvailabilityCommitment({
    ...input,
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
  })
  if (!actor?.uid) errors.createdByUid = 'An authenticated staff member is required.'
  if (hasVenueValidationErrors(errors)) throw new VenueValidationError(errors)

  const docRef = db.collection('venueAvailability').doc()
  await db.runTransaction(async (tx) => {
    const availabilityQuery = db.collection('venueAvailability').where('venueId', '==', commitment.venueId)
    const snapshot = await tx.get(availabilityQuery)
    const conflictingHold = activeCommitmentsInRange(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      { from: new Date(commitment.startsAt), to: new Date(commitment.endsAt) },
    ).find(
      (existing) =>
        existing.status === AVAILABILITY_STATUS.TENTATIVE_HOLD &&
        existing.id !== docRef.id &&
        overlaps(existing, commitment),
    )

    if (conflictingHold) {
      throw new VenueValidationError({ time: 'This venue already has a tentative hold during that period.' })
    }

    tx.set(docRef, {
      ...commitment,
      createdByUid: actor.uid,
      createdByName: actor.name ?? actor.email ?? null,
      createdAt: new Date().toISOString(),
    })
  })

  return { id: docRef.id, ...commitment }
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
