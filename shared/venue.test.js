// SPM-6 — Add a Venue to the Catalogue: venue shape, validation, and audit defaults.
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { buildVenueRecord, hasVenueValidationErrors, normaliseVenueInput } from './venue.js'

const venueStaff = Object.freeze({
  uid: 'venue-staff-1',
  name: 'Venue Staff One',
  email: 'venue.staff@example.test',
})

describe('SPM-6 — Add a Venue to the Catalogue model', () => {
  test('builds one independently bookable venue record with audit metadata', () => {
    const now = new Date('2026-10-02T09:00:00.000Z')
    const { venue, errors } = buildVenueRecord(
      {
        name: 'Conference Hall A',
        location: 'Level 3, Singapore Campus',
        maximumCapacity: '120',
        facilities: 'Projector\nStage\nWi-Fi',
        accessibilityFeatures: ['Wheelchair access', 'Accessible washroom'],
        supportedLayouts: ['Theatre', 'Classroom'],
        operatingHours: 'Monday-Friday 09:00-18:00',
        createdByUid: 'attacker',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
      venueStaff,
      now,
    )

    assert.deepEqual(errors, {})
    assert.equal(venue.name, 'Conference Hall A')
    assert.equal(venue.maximumCapacity, 120)
    assert.deepEqual(venue.facilities, ['Projector', 'Stage', 'Wi-Fi'])
    assert.deepEqual(venue.accessibilityFeatures, ['Wheelchair access', 'Accessible washroom'])
    assert.deepEqual(venue.supportedLayouts, ['Theatre', 'Classroom'])
    assert.equal(venue.operatingHours, 'Monday-Friday 09:00-18:00')
    assert.equal(venue.createdByUid, venueStaff.uid)
    assert.equal(venue.createdByName, venueStaff.name)
    assert.equal(venue.createdAt, now.toISOString())
    assert.equal(venue.updatedAt, now.toISOString())
  })

  test('returns every missing required catalogue field', () => {
    const { errors } = normaliseVenueInput({})

    assert.deepEqual(errors, {
      name: 'Required.',
      location: 'Required.',
      maximumCapacity: 'Required.',
      facilities: 'Required.',
      accessibilityFeatures: 'Required.',
      supportedLayouts: 'Required.',
      operatingHours: 'Required.',
    })
  })

  test('validates capacity, text lengths, and list item types', () => {
    const { errors } = normaliseVenueInput({
      name: 'A'.repeat(161),
      location: 'Level 3',
      maximumCapacity: '0',
      facilities: ['Projector', 123],
      accessibilityFeatures: ['Wheelchair access'],
      supportedLayouts: [],
      operatingHours: 'Daily 09:00-18:00',
    })

    assert.equal(errors.name, 'Must be 160 characters or fewer.')
    assert.equal(errors.maximumCapacity, 'Must be a positive whole number.')
    assert.equal(errors.facilities, 'Must contain only text values.')
    assert.equal(errors.supportedLayouts, 'Required.')
    assert.equal(errors.location, undefined)
    assert.equal(errors.operatingHours, undefined)
  })

  test('normalises multiline and array inputs while preserving valid entered details', () => {
    const { venue, errors } = normaliseVenueInput({
      name: ' Seminar Room B ',
      location: ' Level 2 ',
      maximumCapacity: '40',
      facilities: ' Projector \n\n Whiteboard ',
      accessibilityFeatures: [' Lift access ', ' Hearing loop '],
      supportedLayouts: ' Boardroom \n Workshop ',
      operatingHours: ' Weekdays 08:00-20:00 ',
    })

    assert.deepEqual(errors, {})
    assert.equal(venue.name, 'Seminar Room B')
    assert.equal(venue.location, 'Level 2')
    assert.deepEqual(venue.facilities, ['Projector', 'Whiteboard'])
    assert.deepEqual(venue.accessibilityFeatures, ['Lift access', 'Hearing loop'])
    assert.deepEqual(venue.supportedLayouts, ['Boardroom', 'Workshop'])
    assert.equal(venue.operatingHours, 'Weekdays 08:00-20:00')
  })

  test('requires an authenticated Venue Staff identity for audit ownership', () => {
    const { errors } = buildVenueRecord({
      name: 'Conference Hall A',
      location: 'Level 3',
      maximumCapacity: 120,
      facilities: ['Projector'],
      accessibilityFeatures: ['Wheelchair access'],
      supportedLayouts: ['Theatre'],
      operatingHours: 'Monday-Friday 09:00-18:00',
    })

    assert.equal(errors.createdByUid, 'An authenticated Venue Staff member is required.')
    assert.equal(hasVenueValidationErrors(errors), true)
  })
})
