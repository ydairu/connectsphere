// SPM-4 AC1/AC2/AC3/AC4/AC5/AC6 — owned draft load/update persistence and privacy.

import { describe, expect, it } from 'vitest'

import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import {
  EventRequestForbiddenError,
  getOwnedDraftEventRequest,
  updateDraftEventRequest,
} from '../../../backend/src/services/eventRequestService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  roles: ['organiser'],
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

function fakeDb(eventRequests = {}) {
  return createFakeFirestore({ eventRequests })
}

describe('SPM-4 — save event request as draft service (integration)', () => {
  it('spm4_loads_an_owned_unsubmitted_draft_with_all_saved_values_retained', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: organiser.uid,
        organisationId: organiser.organisationId,
        core: {
          title: 'Saved draft',
          purpose: 'Planning session',
          expectedAttendees: 20,
        },
        venue: { layoutPreference: 'Classroom' },
        equipment: { requirements: 'Projector' },
        registration: { required: true, notes: 'Collect dietary notes' },
      },
    })

    const draft = await getOwnedDraftEventRequest('request-1', organiser, db)

    expect(draft.id).toBe('request-1')
    expect(draft.status).toBe(DRAFT)
    expect(draft.ownerUid).toBe(organiser.uid)
    expect(draft.core.title).toBe('Saved draft')
    expect(draft.venue.layoutPreference).toBe('Classroom')
    expect(draft.equipment.requirements).toBe('Projector')
    expect(draft.registration.notes).toBe('Collect dietary notes')
  })

  it('spm4_rejects_loading_a_draft_owned_by_another_organiser', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: 'other-organiser',
        core: { title: 'Private draft' },
      },
    })

    await expect(getOwnedDraftEventRequest('request-1', organiser, db)).rejects.toBeInstanceOf(EventRequestForbiddenError)
  })

  it('spm4_rejects_loading_a_request_that_is_no_longer_an_unsubmitted_draft', async () => {
    const db = fakeDb({
      'request-1': {
        status: SUBMITTED,
        ownerUid: organiser.uid,
        core: { title: 'Submitted request' },
      },
    })

    await expect(getOwnedDraftEventRequest('request-1', organiser, db)).rejects.toBeInstanceOf(EventRequestForbiddenError)
  })

  it('spm4_updates_an_owned_unsubmitted_draft_without_changing_protected_fields', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: organiser.uid,
        assignedStaffUids: [],
        core: { title: 'Original title' },
      },
    })

    const updated = await updateDraftEventRequest(
      'request-1',
      {
        status: SUBMITTED,
        ownerUid: 'other-user',
        core: { title: 'Updated title' },
      },
      organiser,
      db,
    )

    expect(updated.status).toBe(DRAFT)
    expect(updated.ownerUid).toBe(organiser.uid)
    expect(updated.core.title).toBe('Updated title')
  })

  it('spm4_rejects_updates_from_a_different_organiser', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: 'other-organiser',
        core: { title: 'Private draft' },
      },
    })

    await expect(updateDraftEventRequest('request-1', { core: { title: 'Nope' } }, organiser, db)).rejects.toBeInstanceOf(
      EventRequestForbiddenError,
    )
  })

  it('spm4_rejects_updates_after_a_request_is_no_longer_an_unsubmitted_draft', async () => {
    const db = fakeDb({
      'request-1': {
        status: SUBMITTED,
        ownerUid: organiser.uid,
        core: { title: 'Submitted request' },
      },
    })

    await expect(updateDraftEventRequest('request-1', { core: { title: 'Nope' } }, organiser, db)).rejects.toBeInstanceOf(
      EventRequestForbiddenError,
    )
  })
})
