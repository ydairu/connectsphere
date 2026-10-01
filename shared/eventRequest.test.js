// SPM-7 — Create an Event Request: request shape, ownership, and non-submission defaults.
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { DRAFT } from './status.js'
import { buildDraftEventRequest, buildDraftEventRequestUpdate, validateEventRequestSubmission } from './eventRequest.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

describe('SPM-7 — Create an Event Request model', () => {
  test('builds a draft request owned by exactly one authenticated Event Organiser', () => {
    const now = new Date('2026-09-15T10:00:00.000Z')
    const { request, errors } = buildDraftEventRequest(
      {
        core: {
          title: 'Annual Partner Forum',
          purpose: 'Partner updates',
          description: 'A half-day event.',
          expectedAttendees: '80',
          durationHours: '4',
          preferredDateTime: '2026-11-20T09:00:00+08:00',
        },
        venue: {
          layoutPreference: 'theatre',
          accessibilityRequired: true,
          accessibilityNeeds: 'Wheelchair access',
        },
        equipment: {
          requirements: 'Projector\nWireless microphone',
          technicalSupportNeeded: true,
        },
        registration: {
          enabled: true,
          notes: 'Registration required for all attendees.',
        },
      },
      organiser,
      now,
    )

    assert.deepEqual(errors, {})
    assert.equal(request.status, DRAFT)
    assert.equal(request.ownerUid, organiser.uid)
    assert.equal(request.organisationId, organiser.organisationId)
    assert.equal(request.assignedStaffUids.length, 0)
    assert.equal(request.core.expectedAttendees, 80)
    assert.equal(request.core.durationHours, 4)
    assert.deepEqual(request.equipment.requirements, ['Projector', 'Wireless microphone'])
    assert.equal(request.internal.planningNotes, '')
    assert.equal(request.createdAt, now.toISOString())
    assert.equal(request.updatedAt, now.toISOString())
  })

  test('allows incomplete unsubmitted requests while preserving the draft status', () => {
    const { request, errors } = buildDraftEventRequest({}, organiser, new Date('2026-09-15T10:00:00.000Z'))

    assert.deepEqual(errors, {})
    assert.equal(request.status, DRAFT)
    assert.equal(request.core.title, null)
    assert.equal(request.core.expectedAttendees, null)
    assert.equal(request.venue.layoutPreference, null)
    assert.deepEqual(request.equipment.requirements, [])
    assert.equal(request.registration.enabled, false)
  })

  test('validates field formats without requiring submit-complete data', () => {
    const { errors } = buildDraftEventRequest(
      {
        core: {
          expectedAttendees: 'ten',
          durationHours: '-1',
          preferredDateTime: 'not-a-date',
        },
      },
      organiser,
    )

    assert.equal(errors['core.expectedAttendees'], 'Must be a positive whole number.')
    assert.equal(errors['core.durationHours'], 'Must be a positive number.')
    assert.equal(errors['core.preferredDateTime'], 'Must be a valid date/time.')
    assert.equal(errors['core.title'], undefined)
    assert.equal(errors['core.purpose'], undefined)
  })

  test('does not let update input alter owner, status, staff assignment, or internal fields', () => {
    const { update, errors } = buildDraftEventRequestUpdate({
      ownerUid: 'attacker',
      status: 'submitted',
      assignedStaffUids: ['staff-1'],
      internal: { planningNotes: 'should not be accepted' },
      core: { title: 'Updated title' },
    })

    assert.deepEqual(errors, {})
    assert.equal(update.ownerUid, undefined)
    assert.equal(update.status, undefined)
    assert.equal(update.assignedStaffUids, undefined)
    assert.equal(update.internal, undefined)
    assert.equal(update.core.title, 'Updated title')
  })
})

describe('SPM-3 — Submit an Event Request validation', () => {
  test('accepts a draft with every mandatory submission field present', () => {
    const { errors } = validateEventRequestSubmission({
      core: {
        title: 'Annual Partner Forum',
        purpose: 'Partner updates',
        expectedAttendees: 80,
        durationHours: 4,
        preferredDateTime: '2026-11-20T09:00:00+08:00',
      },
      venue: {
        layoutPreference: 'Theatre',
      },
    })

    assert.deepEqual(errors, {})
  })

  test('returns every missing mandatory submission field', () => {
    const { errors } = validateEventRequestSubmission({})

    assert.deepEqual(errors, {
      'core.title': 'Required before submission.',
      'core.purpose': 'Required before submission.',
      'core.expectedAttendees': 'Required before submission.',
      'core.durationHours': 'Required before submission.',
      'core.preferredDateTime': 'Required before submission.',
      'venue.layoutPreference': 'Required before submission.',
    })
  })

  test('keeps format validation errors during submission validation', () => {
    const { errors } = validateEventRequestSubmission({
      core: {
        title: 'Annual Partner Forum',
        purpose: 'Partner updates',
        expectedAttendees: 'many',
        durationHours: '-2',
        preferredDateTime: 'next week',
      },
      venue: {
        layoutPreference: 'Theatre',
      },
    })

    assert.equal(errors['core.expectedAttendees'], 'Must be a positive whole number.')
    assert.equal(errors['core.durationHours'], 'Must be a positive number.')
    assert.equal(errors['core.preferredDateTime'], 'Must be a valid date/time.')
  })
})
