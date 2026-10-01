// SPM-7 AC1/AC5/AC7/AC8 — backend create-draft persistence and non-submission behaviour.

import { describe, expect, it } from 'vitest'

import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import { createDraftEventRequest } from '../../../backend/src/services/eventRequestService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  roles: ['organiser'],
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

describe('SPM-7 — event request creation service (integration)', () => {
  it('spm7_creates_an_unsubmitted_draft_owned_by_the_authenticated_organiser', async () => {
    const db = createFakeFirestore({ eventRequests: {} })

    const created = await createDraftEventRequest(
      {
        ownerUid: 'body-owner-must-not-win',
        status: SUBMITTED,
        core: { title: 'Partner Forum', expectedAttendees: '50' },
      },
      organiser,
      db,
    )

    expect(created.id).toBe('request-1')
    expect(created.status).toBe(DRAFT)
    expect(created.ownerUid).toBe(organiser.uid)
    expect(created.organisationId).toBe(organiser.organisationId)
    expect(created.core.title).toBe('Partner Forum')
    expect(created.core.expectedAttendees).toBe(50)
    expect(created.assignedStaffUids).toEqual([])
    expect(created.assignedCoordinatorUid).toBeNull()
  })

  it('spm7_rejects_invalid_field_formats_before_persistence', async () => {
    const db = createFakeFirestore({ eventRequests: {} })

    await expect(createDraftEventRequest({ core: { expectedAttendees: '-4' } }, organiser, db)).rejects.toMatchObject({
      name: 'EventRequestValidationError',
      errors: {
        'core.expectedAttendees': 'Must be a positive whole number.',
      },
    })

    expect(db.store.size).toBe(0)
  })
})
