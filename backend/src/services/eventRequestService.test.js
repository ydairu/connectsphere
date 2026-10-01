// SPM-7 — Event request persistence rules.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import {
  createDraftEventRequest,
  EventRequestForbiddenError,
  EventRequestValidationError,
  getOwnedDraftEventRequest,
  submitDraftEventRequest,
  updateDraftEventRequest,
} from './eventRequestService.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  roles: ['organiser'],
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

function fakeDb(initialDocuments = {}) {
  const store = new Map(Object.entries(initialDocuments))

  return {
    store,
    collection(name) {
      assert.equal(name, 'eventRequests')
      return {
        async add(document) {
          const id = `request-${store.size + 1}`
          store.set(id, document)
          return { id }
        },
        doc(id) {
          return {
            async get() {
              return {
                exists: store.has(id),
                data: () => store.get(id),
              }
            },
            async update(update) {
              store.set(id, { ...store.get(id), ...update })
            },
          }
        },
      }
    },
  }
}

describe('SPM-7 — Event request service', () => {
  test('creates an unsubmitted draft request owned by the authenticated organiser', async () => {
    const db = fakeDb()

    const created = await createDraftEventRequest(
      {
        ownerUid: 'body-owner-must-not-win',
        status: SUBMITTED,
        core: { title: 'Partner Forum', expectedAttendees: '50' },
      },
      organiser,
      db,
    )

    assert.equal(created.id, 'request-1')
    assert.equal(created.status, DRAFT)
    assert.equal(created.ownerUid, organiser.uid)
    assert.equal(created.organisationId, organiser.organisationId)
    assert.equal(created.core.title, 'Partner Forum')
    assert.equal(created.core.expectedAttendees, 50)
    assert.deepEqual(created.assignedStaffUids, [])
  })

  test('rejects invalid field formats before persistence', async () => {
    const db = fakeDb()

    await assert.rejects(
      () => createDraftEventRequest({ core: { expectedAttendees: '-4' } }, organiser, db),
      (error) => {
        assert.ok(error instanceof EventRequestValidationError)
        assert.equal(error.errors['core.expectedAttendees'], 'Must be a positive whole number.')
        return true
      },
    )

    assert.equal(db.store.size, 0)
  })

  test('loads an owned unsubmitted draft with all saved values retained', async () => {
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

    assert.equal(draft.id, 'request-1')
    assert.equal(draft.status, DRAFT)
    assert.equal(draft.ownerUid, organiser.uid)
    assert.equal(draft.core.title, 'Saved draft')
    assert.equal(draft.venue.layoutPreference, 'Classroom')
    assert.equal(draft.equipment.requirements, 'Projector')
    assert.equal(draft.registration.notes, 'Collect dietary notes')
  })

  test('rejects loading a draft owned by another organiser', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: 'other-organiser',
        core: { title: 'Private draft' },
      },
    })

    await assert.rejects(() => getOwnedDraftEventRequest('request-1', organiser, db), EventRequestForbiddenError)
  })

  test('rejects loading a request that is no longer an unsubmitted draft', async () => {
    const db = fakeDb({
      'request-1': {
        status: SUBMITTED,
        ownerUid: organiser.uid,
        core: { title: 'Submitted request' },
      },
    })

    await assert.rejects(() => getOwnedDraftEventRequest('request-1', organiser, db), EventRequestForbiddenError)
  })

  test('allows the owner to update an unsubmitted draft without changing protected fields', async () => {
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

    assert.equal(updated.status, DRAFT)
    assert.equal(updated.ownerUid, organiser.uid)
    assert.equal(updated.core.title, 'Updated title')
  })

  test('rejects updates from a different organiser', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: 'other-organiser',
        core: { title: 'Private draft' },
      },
    })

    await assert.rejects(
      () => updateDraftEventRequest('request-1', { core: { title: 'Nope' } }, organiser, db),
      EventRequestForbiddenError,
    )
  })

  test('rejects updates after a request is no longer an unsubmitted draft', async () => {
    const db = fakeDb({
      'request-1': {
        status: SUBMITTED,
        ownerUid: organiser.uid,
        core: { title: 'Submitted request' },
      },
    })

    await assert.rejects(
      () => updateDraftEventRequest('request-1', { core: { title: 'Nope' } }, organiser, db),
      EventRequestForbiddenError,
    )
  })

  test('submits an owned draft with all mandatory fields', async () => {
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

    assert.equal(submitted.status, SUBMITTED)
    assert.equal(submitted.ownerUid, organiser.uid)
    assert.equal(submitted.core.title, 'Ready request')
    assert.equal(submitted.updatedAt, now.toISOString())
    assert.equal(db.store.get('request-1').status, SUBMITTED)
  })

  test('rejects submission with every missing mandatory field and leaves the draft unchanged', async () => {
    const db = fakeDb({
      'request-1': {
        status: DRAFT,
        ownerUid: organiser.uid,
        core: { description: 'Still incomplete' },
        venue: {},
      },
    })

    await assert.rejects(
      () => submitDraftEventRequest('request-1', organiser, db),
      (error) => {
        assert.ok(error instanceof EventRequestValidationError)
        assert.deepEqual(error.errors, {
          'core.title': 'Required before submission.',
          'core.purpose': 'Required before submission.',
          'core.expectedAttendees': 'Required before submission.',
          'core.durationHours': 'Required before submission.',
          'core.preferredDateTime': 'Required before submission.',
          'venue.layoutPreference': 'Required before submission.',
        })
        return true
      },
    )

    assert.equal(db.store.get('request-1').status, DRAFT)
    assert.equal(db.store.get('request-1').core.description, 'Still incomplete')
  })

  test('rejects submission from a different organiser', async () => {
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

    await assert.rejects(() => submitDraftEventRequest('request-1', organiser, db), EventRequestForbiddenError)
    assert.equal(db.store.get('request-1').status, DRAFT)
  })

  test('rejects submission after a request is no longer an unsubmitted draft', async () => {
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

    await assert.rejects(() => submitDraftEventRequest('request-1', organiser, db), EventRequestForbiddenError)
    assert.equal(db.store.get('request-1').status, SUBMITTED)
  })
})
