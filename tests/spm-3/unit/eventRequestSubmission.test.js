// SPM-3 AC1/AC2/AC4 — shared submission validation for mandatory event-request fields.

import { describe, expect, it } from 'vitest'

import { validateEventRequestSubmission } from '../../../shared/eventRequest.js'

describe('SPM-3 — submit event request validation (unit)', () => {
  it('spm3_accepts_a_draft_with_every_mandatory_submission_field_present', () => {
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

    expect(errors).toEqual({})
  })

  it('spm3_returns_every_missing_mandatory_submission_field', () => {
    const { errors } = validateEventRequestSubmission({})

    expect(errors).toEqual({
      'core.title': 'Required before submission.',
      'core.purpose': 'Required before submission.',
      'core.expectedAttendees': 'Required before submission.',
      'core.durationHours': 'Required before submission.',
      'core.preferredDateTime': 'Required before submission.',
      'venue.layoutPreference': 'Required before submission.',
    })
  })

  it('spm3_keeps_format_validation_errors_during_submission_validation', () => {
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

    expect(errors['core.expectedAttendees']).toBe('Must be a positive whole number.')
    expect(errors['core.durationHours']).toBe('Must be a positive number.')
    expect(errors['core.preferredDateTime']).toBe('Must be a valid date/time.')
  })
})
