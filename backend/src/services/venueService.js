import { buildVenueRecord, hasVenueValidationErrors } from '../../../shared/venue.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

const CATALOGUE_FIELDS = [
  'name',
  'location',
  'maximumCapacity',
  'facilities',
  'accessibilityFeatures',
  'supportedLayouts',
  'operatingHours',
]

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

function projectVenueCatalogueItem(venue) {
  const item = { id: venue.id }
  for (const field of CATALOGUE_FIELDS) item[field] = venue[field]
  return item
}
