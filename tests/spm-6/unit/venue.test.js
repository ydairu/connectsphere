// SPM-6 AC1/AC2/AC6/AC7/AC9/AC10 — shared venue catalogue validation and audit defaults.

import { describe, expect, it } from 'vitest'

import { buildVenueRecord, hasVenueValidationErrors, normaliseVenueInput } from '../../../shared/venue.js'

const venueStaff = Object.freeze({
  uid: 'venue-staff-1',
  name: 'Venue Staff One',
  email: 'venue.staff@example.test',
})

describe('SPM-6 — venue catalogue rules (unit)', () => {
  it('spm6_builds_one_independently_bookable_venue_with_audit_metadata', () => {
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

    expect(errors).toEqual({})
    expect(venue.name).toBe('Conference Hall A')
    expect(venue.maximumCapacity).toBe(120)
    expect(venue.facilities).toEqual(['Projector', 'Stage', 'Wi-Fi'])
    expect(venue.accessibilityFeatures).toEqual(['Wheelchair access', 'Accessible washroom'])
    expect(venue.supportedLayouts).toEqual(['Theatre', 'Classroom'])
    expect(venue.operatingHours).toBe('Monday-Friday 09:00-18:00')
    expect(venue.createdByUid).toBe(venueStaff.uid)
    expect(venue.createdByName).toBe(venueStaff.name)
    expect(venue.createdAt).toBe(now.toISOString())
    expect(venue.updatedAt).toBe(now.toISOString())
  })

  it('spm6_returns_every_missing_required_catalogue_field', () => {
    const { errors } = normaliseVenueInput({})

    expect(errors).toEqual({
      name: 'Required.',
      location: 'Required.',
      maximumCapacity: 'Required.',
      facilities: 'Required.',
      accessibilityFeatures: 'Required.',
      supportedLayouts: 'Required.',
      operatingHours: 'Required.',
    })
  })

  it('spm6_validates_capacity_text_lengths_and_list_item_types', () => {
    const { errors } = normaliseVenueInput({
      name: 'A'.repeat(161),
      location: 'Level 3',
      maximumCapacity: '0',
      facilities: ['Projector', 123],
      accessibilityFeatures: ['Wheelchair access'],
      supportedLayouts: [],
      operatingHours: 'Daily 09:00-18:00',
    })

    expect(errors.name).toBe('Must be 160 characters or fewer.')
    expect(errors.maximumCapacity).toBe('Must be a positive whole number.')
    expect(errors.facilities).toBe('Must contain only text values.')
    expect(errors.supportedLayouts).toBe('Required.')
    expect(errors.location).toBeUndefined()
    expect(errors.operatingHours).toBeUndefined()
  })

  it('spm6_normalises_multiline_and_array_inputs_while_preserving_entered_details', () => {
    const { venue, errors } = normaliseVenueInput({
      name: ' Seminar Room B ',
      location: ' Level 2 ',
      maximumCapacity: '40',
      facilities: ' Projector \n\n Whiteboard ',
      accessibilityFeatures: [' Lift access ', ' Hearing loop '],
      supportedLayouts: ' Boardroom \n Workshop ',
      operatingHours: ' Weekdays 08:00-20:00 ',
    })

    expect(errors).toEqual({})
    expect(venue.name).toBe('Seminar Room B')
    expect(venue.location).toBe('Level 2')
    expect(venue.facilities).toEqual(['Projector', 'Whiteboard'])
    expect(venue.accessibilityFeatures).toEqual(['Lift access', 'Hearing loop'])
    expect(venue.supportedLayouts).toEqual(['Boardroom', 'Workshop'])
    expect(venue.operatingHours).toBe('Weekdays 08:00-20:00')
  })

  it('spm6_requires_authenticated_venue_staff_identity_for_audit_ownership', () => {
    const { errors } = buildVenueRecord({
      name: 'Conference Hall A',
      location: 'Level 3',
      maximumCapacity: 120,
      facilities: ['Projector'],
      accessibilityFeatures: ['Wheelchair access'],
      supportedLayouts: ['Theatre'],
      operatingHours: 'Monday-Friday 09:00-18:00',
    })

    expect(errors.createdByUid).toBe('An authenticated Venue Staff member is required.')
    expect(hasVenueValidationErrors(errors)).toBe(true)
  })
})
