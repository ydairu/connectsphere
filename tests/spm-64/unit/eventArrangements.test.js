// SPM-64 unit suite — the arrangements summary rows and the sign-off wording shared with SPM-9's
// "Arrangements and cancellation" card (frontend/src/utils/eventArrangements.js). Pure functions.

import { describe, expect, it } from 'vitest'

import {
  AWAITING_APPROVAL,
  NOT_REQUIRED,
  NOT_REVIEWED_CLOSED,
  NOT_STARTED,
  arrangementRows,
  signOffText,
} from '../../../frontend/src/utils/eventArrangements.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'

const required = { required: true, decision: null }

describe('SPM-64 — sign-off wording', () => {
  it.each([SUBMITTED, UNDER_REVIEW, RETURNED])('before Planning (%s) an undecided arrangement is not started', (status) => {
    expect(signOffText(required, status)).toBe(NOT_STARTED)
    expect(NOT_STARTED).toBe('Not started — reviewed during planning')
  })

  it.each([PLANNING, CONFIRMED])('at %s an undecided arrangement is awaiting approval', (status) => {
    expect(signOffText(required, status)).toBe(AWAITING_APPROVAL)
  })

  describe.each([COMPLETED, CANCELLED, REJECTED])('once the event is closed (%s)', (status) => {
    it('an undecided arrangement was not reviewed', () => {
      expect(signOffText(required, status)).toBe(NOT_REVIEWED_CLOSED)
      expect(NOT_REVIEWED_CLOSED).toBe('Not reviewed — event closed')
    })

    it.each([
      [{ required: true, decision: 'approved' }, 'Approved'],
      [{ required: true, decision: 'rejected' }, 'Rejected'],
      [{ required: false, decision: null }, NOT_REQUIRED],
      [{ required: false, decision: 'approved' }, NOT_REQUIRED],
    ])('a decided or unneeded arrangement keeps its wording (%o → %s)', (arrangement, expected) => {
      expect(signOffText(arrangement, status)).toBe(expected)
    })
  })

  it('a decision and "not required" read the same at every status', () => {
    for (const status of [SUBMITTED, PLANNING, CONFIRMED]) {
      expect(signOffText({ required: true, decision: 'approved' }, status)).toBe('Approved')
      expect(signOffText({ required: true, decision: 'rejected' }, status)).toBe('Rejected')
      expect(signOffText({ required: false, decision: null }, status)).toBe(NOT_REQUIRED)
    }
  })
})

describe('SPM-64 AC5 — arrangement rows', () => {
  const request = {
    status: PLANNING,
    core: { preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 4 },
    venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Wheelchair access' },
    equipment: { requirements: ['projector', 'wireless microphone'], technicalSupportNeeded: true },
  }
  const arrangements = {
    venue: { required: true, decision: 'approved', at: '2026-10-01T00:00:00.000Z' },
    technical: { required: true, decision: null, at: null },
  }

  it('lists date and time, venue and equipment as requested, with their sign-off', () => {
    const [when, venue, equipment] = arrangementRows(request, arrangements)
    expect(when.label).toBe('Date and time')
    expect(when.requested).toContain('4 hours')
    expect(when.requested).toContain('2026')
    expect(when.signOff).toBeNull()
    expect(venue).toEqual({ label: 'Venue', requested: 'theatre layout · Wheelchair access', signOff: 'Approved' })
    expect(equipment).toEqual({ label: 'Equipment', requested: 'projector, wireless microphone, technical support', signOff: AWAITING_APPROVAL })
  })

  it('says "Not started" for sign-off before Planning', () => {
    const rows = arrangementRows({ ...request, status: SUBMITTED }, { venue: required, technical: required })
    expect(rows.map((row) => row.signOff)).toEqual([null, NOT_STARTED, NOT_STARTED])
  })

  it('handles missing values and no equipment', () => {
    const rows = arrangementRows(
      { status: SUBMITTED, core: { preferredDateTime: null, durationHours: null }, venue: { layoutPreference: null, accessibilityRequired: false }, equipment: { requirements: [], technicalSupportNeeded: false } },
      { venue: required, technical: { required: false, decision: null } },
    )
    expect(rows.map(({ requested }) => requested)).toEqual(['Not set', 'Not set', 'None'])
    expect(rows[2].signOff).toBe(NOT_REQUIRED)
  })

  it('accessibility without details, and a one-hour event', () => {
    const rows = arrangementRows({ ...request, core: { ...request.core, durationHours: 1 }, venue: { layoutPreference: null, accessibilityRequired: true, accessibilityNeeds: '  ' } }, null)
    expect(rows[0].requested).toContain('1 hour')
    expect(rows[0].requested).not.toContain('hours')
    expect(rows[1]).toEqual({ label: 'Venue', requested: 'Accessibility required', signOff: null })
  })

  it('shows no sign-off when the API sends none for that arrangement', () => {
    expect(arrangementRows(request, null).map((row) => row.signOff)).toEqual([null, null, null])
  })
})
