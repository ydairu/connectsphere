// SPM-6 — Venue catalogue persistence rules.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createFakeFirestore } from '../testing/fakeFirestore.js'
import { createVenue, VenueValidationError } from './venueService.js'

const venueStaff = Object.freeze({
  uid: 'venue-staff-1',
  roles: ['venue_staff'],
  name: 'Venue Staff One',
  email: 'venue.staff@example.test',
})

const validVenueInput = Object.freeze({
  name: 'Conference Hall A',
  location: 'Level 3, Singapore Campus',
  maximumCapacity: '120',
  facilities: 'Projector\nStage\nWi-Fi',
  accessibilityFeatures: ['Wheelchair access', 'Accessible washroom'],
  supportedLayouts: ['Theatre', 'Classroom'],
  operatingHours: 'Monday-Friday 09:00-18:00',
})

describe('SPM-6 — Venue catalogue service', () => {
  test('creates one venue record with validated fields and server audit metadata', async () => {
    const db = createFakeFirestore({ venues: {} })

    const created = await createVenue(
      {
        ...validVenueInput,
        createdByUid: 'body-value-must-not-win',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      venueStaff,
      db,
    )

    assert.equal(created.id, 'request-1')
    assert.equal(created.name, 'Conference Hall A')
    assert.equal(created.maximumCapacity, 120)
    assert.deepEqual(created.facilities, ['Projector', 'Stage', 'Wi-Fi'])
    assert.equal(created.createdByUid, venueStaff.uid)
    assert.equal(created.createdByName, venueStaff.name)

    const stored = [...db.collectionData('venues').values()]
    assert.equal(stored.length, 1)
    assert.equal(stored[0].createdByUid, venueStaff.uid)
    assert.equal(stored[0].name, 'Conference Hall A')
  })

  test('rejects invalid venue details before persistence', async () => {
    const db = createFakeFirestore({ venues: {} })

    await assert.rejects(
      () => createVenue({ ...validVenueInput, maximumCapacity: '-1', supportedLayouts: [] }, venueStaff, db),
      (error) => {
        assert.ok(error instanceof VenueValidationError)
        assert.equal(error.errors.maximumCapacity, 'Must be a positive whole number.')
        assert.equal(error.errors.supportedLayouts, 'Required.')
        return true
      },
    )

    assert.equal(db.collectionData('venues').size, 0)
  })

  test('requires an authenticated Venue Staff identity for audit ownership', async () => {
    const db = createFakeFirestore({ venues: {} })

    await assert.rejects(
      () => createVenue(validVenueInput, null, db),
      (error) => {
        assert.ok(error instanceof VenueValidationError)
        assert.equal(error.errors.createdByUid, 'An authenticated Venue Staff member is required.')
        return true
      },
    )

    assert.equal(db.collectionData('venues').size, 0)
  })
})
