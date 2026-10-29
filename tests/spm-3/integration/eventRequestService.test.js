// SPM-3 AC2/AC3/AC4/AC5/AC6/AC7 — backend submit transition, validation, and access rules.

import { describe, expect, it } from 'vitest'

import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import {
  EventRequestForbiddenError,
  submitDraftEventRequest,
} from '../../../backend/src/services/eventRequestService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  roles: ['organiser'],
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

function fakeDb(eventRequests = {}, users = { 'coordinator-1': { roles: ['coordinator'] } }) {
  return createFakeFirestore({ eventRequests, users })
}

describe('SPM-3 — submit event request service (integration)', () => {
  it('spm3_submits_an_owned_draft_with_all_mandatory_fields', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: organiser.uid,
        core: {
          title: 'Ready request',
          purpose: 'Partner updates',
          expectedAttendees: 50,
          durationHours: 3,
          preferredDateTime: '2026-11-20T09:00:00+08:00',
        },
        venue: { layoutPreference: 'Theatre' },
      },
    })
    const now = new Date('2026-09-20T10:00:00.000Z')

    const submitted = await submitDraftEventRequest('request-1', organiser, db, now)

    expect(submitted.status).toBe(SUBMITTED)
    expect(submitted.ownerUid).toBe(organiser.uid)
    expect(submitted.core.title).toBe('Ready request')
    expect(submitted.updatedAt).toBe(now.toISOString())
    // SPM-68: a submission is no longer assigned automatically; it waits in the Event Coordinator Lead's queue.
    expect(submitted.assignedCoordinatorUid ?? null).toBeNull()
    expect(db.store.get('request-1').status).toBe(SUBMITTED)
    expect(db.store.get('request-1').assignedCoordinatorUid ?? null).toBeNull()
    expect(db.store.get('request-1').submittedAt).toBe(now.toISOString())
  })

  it('spm3_rejects_submission_with_every_missing_mandatory_field_and_leaves_draft_unchanged', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: organiser.uid,
        core: { description: 'Still incomplete' },
        venue: {},
      },
    })

    await expect(submitDraftEventRequest('request-1', organiser, db)).rejects.toMatchObject({
      name: 'EventRequestValidationError',
      errors: {
        'core.title': 'Required before submission.',
        'core.purpose': 'Required before submission.',
        'core.expectedAttendees': 'Required before submission.',
        'core.durationHours': 'Required before submission.',
        'core.preferredDateTime': 'Required before submission.',
        'venue.layoutPreference': 'Required before submission.',
      },
    })

    expect(db.store.get('request-1').status).toBe(DRAFT)
    expect(db.store.get('request-1').core.description).toBe('Still incomplete')
  })

  it('spm3_rejects_submission_from_a_different_organiser', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: 'other-organiser',
        core: {
          title: 'Private request',
          purpose: 'Partner updates',
          expectedAttendees: 50,
          durationHours: 3,
          preferredDateTime: '2026-11-20T09:00:00+08:00',
        },
        venue: { layoutPreference: 'Theatre' },
      },
    })

    await expect(submitDraftEventRequest('request-1', organiser, db)).rejects.toBeInstanceOf(EventRequestForbiddenError)
    expect(db.store.get('request-1').status).toBe(DRAFT)
  })

  it('spm3_rejects_submission_after_a_request_is_no_longer_an_unsubmitted_draft', async () => {
    const db = fakeDb({
      'request-1': {
        status: SUBMITTED,
        ownerUid: organiser.uid,
        core: {
          title: 'Submitted request',
          purpose: 'Partner updates',
          expectedAttendees: 50,
          durationHours: 3,
          preferredDateTime: '2026-11-20T09:00:00+08:00',
        },
        venue: { layoutPreference: 'Theatre' },
      },
    })

    await expect(submitDraftEventRequest('request-1', organiser, db)).rejects.toBeInstanceOf(EventRequestForbiddenError)
    expect(db.store.get('request-1').status).toBe(SUBMITTED)
  })
})
