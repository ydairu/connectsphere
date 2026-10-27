// SPM-91 / SPM-92 — submitting for safety review and recording the review, at the pure-function level
// (shared/safetyReview.js, shared/notifications.js, shared/significantChanges.js). The API suite is
// tests/spm-92/integration/safetyReviewApi.test.js.

import { describe, expect, it } from 'vitest'

import {
  SAFETY_APPROVED_NOTICE,
  SAFETY_CHANGES_REQUESTED_NOTICE,
  SAFETY_REJECTED_NOTICE,
  safetyReviewDecidedNotifications,
} from '../../../shared/notifications.js'
import { COORDINATOR, ORGANISER, SAFETY_OFFICER, VENUE_STAFF } from '../../../shared/permissions.js'
import {
  APPROVE_SAFETY,
  ARRANGEMENTS_NOT_READY,
  CHECK_CONCERN,
  CHECK_SATISFACTORY,
  INVALIDATED_BY_SIGNIFICANT_CHANGE,
  NOT_AWAITING_SAFETY_REVIEW,
  NOT_PERMITTED,
  REJECT_SAFETY_ARRANGEMENT,
  REQUEST_SAFETY_CHANGES,
  SAFETY_ALREADY_APPROVED,
  SAFETY_APPROVED,
  SAFETY_ARRANGEMENT_NOT_REVISED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_CHECKLIST_IDS,
  SAFETY_INVALIDATED,
  SAFETY_NOT_AT_PLANNING,
  SAFETY_REJECTED,
  SAFETY_REVIEW_ALREADY_PENDING,
  SAFETY_REVIEW_PENDING,
  awaitingSafetyReview,
  canDecideSafetyReview,
  canSubmitForSafetyReview,
  normaliseSafetyReviewDecision,
  safetyApproved,
  safetyReviewDecisionUpdate,
  safetyReviewInvalidation,
  safetyReviewListStatus,
  safetyReviewSummary,
} from '../../../shared/safetyReview.js'
import { significantChangeEffects } from '../../../shared/significantChanges.js'
import { CANCELLED, CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'

const coordinator = { uid: 'coord-1', name: 'Casey', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }
const officer = { uid: 'safety-1', name: 'Sam Safety', roles: [SAFETY_OFFICER] }
const owner = { uid: 'organiser-1', roles: [ORGANISER], organisationId: 'org-a' }
const colleague = { uid: 'organiser-2', roles: [ORGANISER], organisationId: 'org-a' }
const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }
const AT = '2026-10-27T03:00:00.000Z'
const ALL_SATISFACTORY = Object.fromEntries(SAFETY_CHECKLIST_IDS.map((id) => [id, { result: CHECK_SATISFACTORY }]))

function event(overrides = {}) {
  return {
    id: 'event-1',
    status: PLANNING,
    ownerUid: owner.uid,
    organisationId: 'org-a',
    assignedCoordinatorUid: coordinator.uid,
    assignedStaffUids: [venueStaff.uid],
    core: { title: 'Forum', expectedAttendees: 120 },
    venue: { layoutPreference: 'Theatre' },
    equipment: { requirements: ['Projector'], technicalSupportNeeded: true },
    arrangementApprovals: { technical: { decision: 'approved' } },
    venueBookingReadiness: { ready: true },
    ...overrides,
  }
}

describe('SPM-91 AC1, AC2 — who may submit, and when', () => {
  it('the assigned Coordinator may submit a Planning event whose arrangements are approved', () => {
    expect(canSubmitForSafetyReview(coordinator, event())).toEqual({ allowed: true })
  })

  it('anyone else may not', () => {
    for (const user of [otherCoordinator, officer, owner, venueStaff]) {
      expect(canSubmitForSafetyReview(user, event()).reason, user.uid).toBe(NOT_PERMITTED)
    }
  })

  it('only in Planning', () => {
    for (const status of [UNDER_REVIEW, CANCELLED]) {
      expect(canSubmitForSafetyReview(coordinator, event({ status })).reason, status).toBe(SAFETY_NOT_AT_PLANNING)
    }
  })

  it('[Team decision pending] a Confirmed event with no review at all (confirmed before SPM-91) may be submitted', () => {
    expect(canSubmitForSafetyReview(coordinator, event({ status: CONFIRMED })).allowed).toBe(true)
    for (const status of [SAFETY_APPROVED, SAFETY_INVALIDATED, SAFETY_CHANGES_REQUESTED]) {
      expect(canSubmitForSafetyReview(coordinator, event({ status: CONFIRMED, safetyReview: { status } })).reason, status).toBe(SAFETY_NOT_AT_PLANNING)
    }
    expect(awaitingSafetyReview(event({ status: CONFIRMED, safetyReview: { status: SAFETY_REVIEW_PENDING } }))).toBe(true)
  })

  it('only when every venue booking and the technical arrangement are approved', () => {
    expect(canSubmitForSafetyReview(coordinator, event({ venueBookingReadiness: { ready: false } })).reason).toBe(ARRANGEMENTS_NOT_READY)
    expect(canSubmitForSafetyReview(coordinator, event({ arrangementApprovals: {} })).reason).toBe(ARRANGEMENTS_NOT_READY)
    // No equipment or support asked for: the venue alone decides.
    const venueOnly = event({ equipment: { requirements: [], technicalSupportNeeded: false }, arrangementApprovals: {} })
    expect(canSubmitForSafetyReview(coordinator, venueOnly).allowed).toBe(true)
  })
})

describe('SPM-91 AC3, AC5 — the queue and resubmission', () => {
  it('a pending review is in the queue; the event stays in Planning', () => {
    const queued = event({ safetyReview: { status: SAFETY_REVIEW_PENDING } })
    expect(awaitingSafetyReview(queued)).toBe(true)
    expect(queued.status).toBe(PLANNING)
    expect(canSubmitForSafetyReview(coordinator, queued).reason).toBe(SAFETY_REVIEW_ALREADY_PENDING)
  })

  it('an approved event is not resubmitted', () => {
    expect(canSubmitForSafetyReview(coordinator, event({ safetyReview: { status: SAFETY_APPROVED } })).reason).toBe(SAFETY_ALREADY_APPROVED)
  })

  it('a rejected arrangement is not resubmitted until it is revised', () => {
    expect(canSubmitForSafetyReview(coordinator, event({ safetyReview: { status: SAFETY_REJECTED } })).reason).toBe(SAFETY_ARRANGEMENT_NOT_REVISED)
    // Revising it (any change to the arrangements) turns the rejection into an invalidation.
    const revised = safetyReviewInvalidation(event({ safetyReview: { status: SAFETY_REJECTED } }), INVALIDATED_BY_SIGNIFICANT_CHANGE, AT)
    expect(canSubmitForSafetyReview(coordinator, event({ safetyReview: revised })).allowed).toBe(true)
  })

  it('after changes or an invalidation the event may be resubmitted once ready', () => {
    for (const status of [SAFETY_CHANGES_REQUESTED, SAFETY_INVALIDATED]) {
      expect(canSubmitForSafetyReview(coordinator, event({ safetyReview: { status } })).allowed, status).toBe(true)
      expect(canSubmitForSafetyReview(coordinator, event({ safetyReview: { status }, venueBookingReadiness: { ready: false } })).reason, status)
        .toBe(ARRANGEMENTS_NOT_READY)
    }
  })
})

describe('SPM-91 AC6 — a significant change invalidates the safety approval', () => {
  const changed = (before) => ({ ...before, core: { ...before.core, expectedAttendees: 300 } })

  it('Confirmed and safety-approved: back to Planning, approval invalidated', () => {
    const before = event({ status: CONFIRMED, safetyReview: { status: SAFETY_APPROVED, submittedAt: 'x' } })
    const { metadata } = significantChangeEffects(coordinator, before, changed(before), { at: AT })
    expect(metadata.status).toBe(PLANNING)
    expect(metadata.safetyReview).toEqual({ status: SAFETY_INVALIDATED, submittedAt: 'x', invalidatedAt: AT, invalidatedReason: INVALIDATED_BY_SIGNIFICANT_CHANGE })
    expect(safetyApproved({ ...before, ...metadata })).toBe(false)
  })

  it('[Team decision pending] a pending review leaves the queue and a rejection counts as revised; changes requested are kept', () => {
    for (const status of [SAFETY_REVIEW_PENDING, SAFETY_REJECTED]) {
      const before = event({ safetyReview: { status } })
      expect(significantChangeEffects(coordinator, before, changed(before), { at: AT }).metadata.safetyReview.status, status).toBe(SAFETY_INVALIDATED)
    }
    const before = event({ safetyReview: { status: SAFETY_CHANGES_REQUESTED } })
    expect(significantChangeEffects(coordinator, before, changed(before), { at: AT }).metadata.safetyReview).toBeUndefined()
  })

  it('an ordinary edit invalidates nothing', () => {
    const before = event({ safetyReview: { status: SAFETY_APPROVED } })
    const after = { ...before, core: { ...before.core, title: 'Renamed' } }
    expect(significantChangeEffects(coordinator, before, after, { at: AT }).metadata).toEqual({})
    expect(safetyReviewInvalidation(event(), INVALIDATED_BY_SIGNIFICANT_CHANGE, AT)).toBeNull()
  })
})

describe('SPM-92 AC1 — only a Safety Officer, within the SPM-66 scope', () => {
  const queued = event({ safetyReview: { status: SAFETY_REVIEW_PENDING } })

  it('a Safety Officer may review a queued event', () => {
    expect(canDecideSafetyReview(officer, queued)).toEqual({ allowed: true })
  })

  it('no other role may, the assigned Coordinator included', () => {
    for (const user of [coordinator, owner, venueStaff]) expect(canDecideSafetyReview(user, queued).reason).toBe(NOT_PERMITTED)
  })

  it('an event that is not in the queue cannot be reviewed', () => {
    expect(canDecideSafetyReview(officer, event()).reason).toBe(NOT_AWAITING_SAFETY_REVIEW)
    expect(canDecideSafetyReview(officer, event({ safetyReview: { status: SAFETY_APPROVED } })).reason).toBe(NOT_AWAITING_SAFETY_REVIEW)
  })
})

describe('SPM-92 AC2, AC3 — the checklist and exactly one outcome', () => {
  it('a complete approval is valid, with optional comments', () => {
    const { value, errors } = normaliseSafetyReviewDecision({ outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })
    expect(errors).toEqual({})
    expect(value.checklist.attendanceCapacity).toEqual({ result: CHECK_SATISFACTORY, comment: '' })
    expect(value.comments).toBe('')
  })

  it('every checklist item needs a result; each may carry a comment', () => {
    const checklist = { ...ALL_SATISFACTORY, emergencyAccess: { result: CHECK_CONCERN, comment: '  Exit B blocked  ' } }
    delete checklist.venueRestrictions
    const { value, errors } = normaliseSafetyReviewDecision({ outcome: APPROVE_SAFETY, checklist })
    expect(errors).toEqual({ 'checklist.venueRestrictions': 'Choose a result for this item.' })
    expect(value.checklist.emergencyAccess.comment).toBe('Exit B blocked')
    expect(normaliseSafetyReviewDecision({ outcome: APPROVE_SAFETY }).errors.checklist).toBeTruthy()
  })

  it('the outcome must be one of the three', () => {
    for (const outcome of [undefined, 'confirm', ['approve', 'reject']]) {
      expect(normaliseSafetyReviewDecision({ outcome, checklist: ALL_SATISFACTORY }).errors.outcome, String(outcome)).toBeTruthy()
    }
  })

  it('comments are required for Request changes and Reject', () => {
    for (const outcome of [REQUEST_SAFETY_CHANGES, REJECT_SAFETY_ARRANGEMENT]) {
      expect(normaliseSafetyReviewDecision({ outcome, checklist: ALL_SATISFACTORY, comments: '   ' }).errors.comments, outcome).toBeTruthy()
      expect(normaliseSafetyReviewDecision({ outcome, checklist: ALL_SATISFACTORY, comments: 'Add stewards' }).errors, outcome).toEqual({})
    }
  })

  it('unknown fields, unknown items and over-long text are refused', () => {
    const { errors } = normaliseSafetyReviewDecision({
      outcome: APPROVE_SAFETY,
      checklist: { ...ALL_SATISFACTORY, fireworks: { result: CHECK_SATISFACTORY }, layout: { result: CHECK_SATISFACTORY, score: 5 } },
      status: 'approved',
      comments: 'x'.repeat(2001),
    })
    expect(Object.keys(errors).sort()).toEqual(['checklist.fireworks', 'checklist.layout.score', 'comments', 'status'])
    expect(normaliseSafetyReviewDecision(null).errors.request).toBeTruthy()
  })
})

describe('SPM-92 AC4–AC6, AC8 — what a review records', () => {
  const queued = event({ safetyReview: { status: SAFETY_REVIEW_PENDING, submittedAt: '2026-10-26T00:00:00.000Z', submittedByUid: coordinator.uid } })

  for (const [outcome, status] of [[APPROVE_SAFETY, SAFETY_APPROVED], [REQUEST_SAFETY_CHANGES, SAFETY_CHANGES_REQUESTED], [REJECT_SAFETY_ARRANGEMENT, SAFETY_REJECTED]]) {
    it(`${outcome}: records the reviewer, time, checklist, outcome and comments; status and sign-offs untouched`, () => {
      const decision = normaliseSafetyReviewDecision({ outcome, checklist: ALL_SATISFACTORY, comments: 'See notes', internalNotes: 'Private' }).value
      const update = safetyReviewDecisionUpdate(officer, queued, decision, AT)
      expect(update.safetyReview).toMatchObject({ status, outcome, decidedAt: AT, submittedAt: queued.safetyReview.submittedAt })
      expect(update.safetyReviews).toEqual([{
        reviewerUid: officer.uid, reviewerName: officer.name, reviewedAt: AT, submittedAt: queued.safetyReview.submittedAt,
        outcome, checklist: decision.checklist, comments: 'See notes', internalNotes: 'Private',
      }])
      // Only the two review fields are written: no status, no arrangementApprovals.
      expect(Object.keys(update).sort()).toEqual(['safetyReview', 'safetyReviews'])
    })
  }

  it('earlier reviews are kept when another is recorded', () => {
    const earlier = { reviewerUid: officer.uid, outcome: REQUEST_SAFETY_CHANGES }
    const decision = normaliseSafetyReviewDecision({ outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY }).value
    const update = safetyReviewDecisionUpdate(officer, { ...queued, safetyReviews: [earlier] }, decision, AT)
    expect(update.safetyReviews).toHaveLength(2)
    expect(update.safetyReviews[0]).toBe(earlier)
  })

  it('the assigned Coordinator is notified of each outcome, with the comments as the reason', () => {
    const expected = { [APPROVE_SAFETY]: SAFETY_APPROVED_NOTICE, [REQUEST_SAFETY_CHANGES]: SAFETY_CHANGES_REQUESTED_NOTICE, [REJECT_SAFETY_ARRANGEMENT]: SAFETY_REJECTED_NOTICE }
    for (const [outcome, type] of Object.entries(expected)) {
      const notices = safetyReviewDecidedNotifications(queued, officer, { outcome, comments: 'Add stewards', at: AT })
      expect(notices, outcome).toEqual([expect.objectContaining({ recipientUid: coordinator.uid, type, reason: 'Add stewards', eventRequestId: 'event-1', createdAt: AT })])
    }
    expect(safetyReviewDecidedNotifications(queued, officer, { outcome: APPROVE_SAFETY, at: AT })[0].reason).toBeNull()
  })
})

describe('SPM-92 AC7 — what each role sees of the review', () => {
  const reviewed = event({
    safetyReview: { status: SAFETY_CHANGES_REQUESTED, outcome: REQUEST_SAFETY_CHANGES, submittedAt: 'sub', decidedAt: AT },
    safetyReviews: [{
      reviewerUid: officer.uid, reviewerName: officer.name, reviewedAt: AT, outcome: REQUEST_SAFETY_CHANGES,
      checklist: ALL_SATISFACTORY, comments: 'Add two stewards at exit B', internalNotes: 'Organiser seemed unsure',
    }],
  })

  it('the owning Organiser sees the outcome and the comments, never internal notes or the reviewer', () => {
    const summary = safetyReviewSummary(owner, reviewed)
    expect(summary).toEqual({ status: SAFETY_CHANGES_REQUESTED, outcome: REQUEST_SAFETY_CHANGES, comments: 'Add two stewards at exit B', reviewedAt: AT })
    expect(JSON.stringify(summary)).not.toMatch(/unsure|Sam Safety|safety-1/)
  })

  it('the Organiser sees no outcome once the review is invalidated', () => {
    const invalidated = { ...reviewed, safetyReview: { ...reviewed.safetyReview, status: SAFETY_INVALIDATED } }
    expect(safetyReviewSummary(owner, invalidated)).toEqual({ status: SAFETY_INVALIDATED, outcome: null, comments: null, reviewedAt: null })
  })

  it('a pending review on an event cancelled or rejected while waiting is not shown', () => {
    const closed = { ...reviewed, status: CANCELLED, safetyReview: { status: SAFETY_REVIEW_PENDING } }
    expect(safetyReviewSummary(owner, closed)).toBeNull()
    expect(safetyReviewSummary(coordinator, closed)).toBeNull()
    expect(safetyReviewListStatus(owner, closed)).toBeNull()
  })

  it('the Organiser sees no outcome while a review is pending', () => {
    expect(safetyReviewSummary(owner, { ...reviewed, safetyReview: { status: SAFETY_REVIEW_PENDING } }))
      .toEqual({ status: SAFETY_REVIEW_PENDING, outcome: null, comments: null, reviewedAt: null })
  })

  it('the assigned Coordinator sees every review in full, without uids', () => {
    const summary = safetyReviewSummary(coordinator, reviewed)
    expect(summary.reviews).toEqual([expect.objectContaining({ reviewerName: officer.name, internalNotes: 'Organiser seemed unsure', comments: 'Add two stewards at exit B' })])
    expect(JSON.stringify(summary)).not.toMatch(/safety-1/)
  })

  it('a colleague, other staff and an unassigned Coordinator see nothing', () => {
    for (const user of [colleague, venueStaff, otherCoordinator]) {
      expect(safetyReviewSummary(user, reviewed), user.uid).toBeNull()
      expect(safetyReviewListStatus(user, reviewed), user.uid).toBeNull()
    }
    expect(safetyReviewListStatus(owner, reviewed)).toBe(SAFETY_CHANGES_REQUESTED)
    expect(safetyReviewSummary(coordinator, event())).toBeNull()
  })
})
