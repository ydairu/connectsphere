// SPM-6 AC4/AC6/AC8/AC10 — backend service persistence and no-write validation paths.

import { describe, expect, it } from 'vitest'

import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { createVenue, VenueValidationError } from '../../../backend/src/services/venueService.js'

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

describe('SPM-6 — venue catalogue service (integration)', () => {
  it('spm6_service_creates_one_venue_with_validated_fields_and_server_audit_metadata', async () => {
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

    expect(created.id).toBe('request-1')
    expect(created.name).toBe('Conference Hall A')
    expect(created.maximumCapacity).toBe(120)
    expect(created.facilities).toEqual(['Projector', 'Stage', 'Wi-Fi'])
    expect(created.createdByUid).toBe(venueStaff.uid)
    expect(created.createdByName).toBe(venueStaff.name)

    const stored = [...db.collectionData('venues').values()]
    expect(stored).toHaveLength(1)
    expect(stored[0].createdByUid).toBe(venueStaff.uid)
    expect(stored[0].name).toBe('Conference Hall A')
  })

  it('spm6_service_rejects_invalid_venue_details_before_persistence', async () => {
    const db = createFakeFirestore({ venues: {} })

    await expect(createVenue({ ...validVenueInput, maximumCapacity: '-1', supportedLayouts: [] }, venueStaff, db)).rejects.toMatchObject({
      name: 'VenueValidationError',
      errors: {
        maximumCapacity: 'Must be a positive whole number.',
        supportedLayouts: 'Required.',
      },
    })

    expect(db.collectionData('venues').size).toBe(0)
  })

  it('spm6_service_requires_authenticated_venue_staff_identity_for_audit_ownership', async () => {
    const db = createFakeFirestore({ venues: {} })

    await expect(createVenue(validVenueInput, null, db)).rejects.toMatchObject({
      name: 'VenueValidationError',
      errors: {
        createdByUid: 'An authenticated Venue Staff member is required.',
      },
    })

    expect(db.collectionData('venues').size).toBe(0)
  })
})
