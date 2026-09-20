// The requests page serves every role from one code path; only its wording differs (SPM-42 view
// criteria, SPM-24 #5). Run with the root `npm test`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ATTENDEE, COORDINATOR, ORGANISER, ROLES, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { requestListCopy } from './requestListCopy.js'

describe('Requests page wording by role', () => {
  test('Every role has wording, with all four fields', () => {
    for (const role of ROLES) {
      const copy = requestListCopy([role])
      for (const field of ['eyebrow', 'title', 'description', 'emptyTitle', 'emptyBody']) {
        assert.ok(copy[field], `${role} is missing ${field}`)
      }
    }
  })

  test('Coordinator, staff, organiser and attendee each get their own heading', () => {
    const titles = [COORDINATOR, VENUE_STAFF, ORGANISER, ATTENDEE].map((role) => requestListCopy([role]).title)
    assert.equal(new Set(titles).size, titles.length, 'headings should differ')
  })

  test('Venue and technical staff share the assigned-events wording', () => {
    assert.deepEqual(requestListCopy([VENUE_STAFF]), requestListCopy([TECHNICAL_STAFF]))
    assert.deepEqual(requestListCopy([VENUE_STAFF, TECHNICAL_STAFF]), requestListCopy([VENUE_STAFF]))
  })

  test('A multi-role user gets the wording of their widest view', () => {
    assert.equal(requestListCopy([ORGANISER, COORDINATOR]).title, requestListCopy([COORDINATOR]).title)
    assert.equal(requestListCopy([ATTENDEE, VENUE_STAFF]).title, requestListCopy([VENUE_STAFF]).title)
    assert.equal(requestListCopy([ATTENDEE, ORGANISER]).title, requestListCopy([ORGANISER]).title)
  })

  test('An account with no recognised role still gets a heading', () => {
    assert.ok(requestListCopy([]).title)
    assert.ok(requestListCopy(['some_future_role']).title)
  })
})
