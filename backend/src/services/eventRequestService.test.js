// SPM-7 — Event request persistence rules.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import {
  createDraftEventRequest,
  EventRequestForbiddenError,
  EventRequestValidationError,
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
})
