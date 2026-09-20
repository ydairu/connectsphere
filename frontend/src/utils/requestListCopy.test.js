// The requests page serves every role from one code path; only its wording differs (SPM-42 view
// criteria, SPM-24 #5). Run with `npm test` (Vitest, via the root script).

import { describe, expect, it } from 'vitest'

import { ATTENDEE, COORDINATOR, ORGANISER, ROLES, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { requestListCopy } from './requestListCopy.js'

describe('Requests page wording by role', () => {
  it('Every role has wording, with all of its fields', () => {
    for (const role of ROLES) {
      const copy = requestListCopy([role])
      for (const field of ['eyebrow', 'title', 'description', 'emptyTitle', 'emptyBody']) {
        expect(copy[field], `${role} is missing ${field}`).toBeTruthy()
      }
    }
  })

  it('Coordinator, staff, organiser and attendee each get their own heading', () => {
    const titles = [COORDINATOR, VENUE_STAFF, ORGANISER, ATTENDEE].map((role) => requestListCopy([role]).title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('Venue and technical staff share the assigned-events wording', () => {
    expect(requestListCopy([TECHNICAL_STAFF])).toEqual(requestListCopy([VENUE_STAFF]))
    expect(requestListCopy([VENUE_STAFF, TECHNICAL_STAFF])).toEqual(requestListCopy([VENUE_STAFF]))
  })

  it('A multi-role user gets the wording of their widest view', () => {
    expect(requestListCopy([ORGANISER, COORDINATOR]).title).toBe(requestListCopy([COORDINATOR]).title)
    expect(requestListCopy([ATTENDEE, VENUE_STAFF]).title).toBe(requestListCopy([VENUE_STAFF]).title)
    expect(requestListCopy([ATTENDEE, ORGANISER]).title).toBe(requestListCopy([ORGANISER]).title)
  })

  it('An account with no recognised role still gets a heading', () => {
    expect(requestListCopy([]).title).toBeTruthy()
    expect(requestListCopy(['some_future_role']).title).toBeTruthy()
  })
})
