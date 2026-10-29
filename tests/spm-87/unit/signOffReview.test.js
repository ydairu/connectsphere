// SPM-87 — which sign-offs a significant change marks, the Coordinator's choice and how the other rules read
// them, at the pure-function level. The API suite is tests/spm-87/integration/signOffReviewApi.test.js.

import { describe, expect, it } from 'vitest'

import { arrangementsApproved } from '../../../shared/arrangements.js'
import { EQUIPMENT_REQUEST_STATUS, RECONFIRM_EQUIPMENT_APPROVAL, equipmentDecision } from '../../../shared/equipmentRequest.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { canSubmitForSafetyReview } from '../../../shared/safetyReview.js'
import { significantChangeBlocked } from '../../../shared/significantChanges.js'
import {
  NO_SIGN_OFF_REVIEW,
  NOT_PERMITTED,
  SIGN_OFF_REVIEW_DECIDED,
  SIGN_OFF_REVIEW_PENDING,
  canDecideSignOffReview,
  normaliseSignOffChoice,
  recordedSignOffs,
  signOffReviewDecision,
  signOffReviewOnChange,
  signOffReviewSummary,
} from '../../../shared/signOffReview.js'
import { CONFIRMED, PLANNING, PREPARATION, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { SIGN_OFF_REVIEW_UNDECIDED, canTransition, CONFIRM } from '../../../shared/statusTransitions.js'
import {
  awaitingReapproval,
  canApproveVenueBooking,
  canRejectVenueBooking,
  pendingVenueBookings,
  venueBookingLabel,
  venueBookingReadiness,
} from '../../../shared/venueBooking.js'

const coordinator = { uid: 'c', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'c2', roles: [COORDINATOR] }
const owner = { uid: 'o', roles: [ORGANISER] }
const venueStaff = { uid: 'v1', roles: [VENUE_STAFF] }
const AT = '2026-10-29T03:00:00.000Z'

const approved = (id, extra = {}) => ({ id, venueNeedId: id, status: 'approved', venueName: id.toUpperCase(), assignedVenueStaffUid: 'v1', createdAt: `2026-10-0${id.length}`, ...extra })
const bookings = [approved('hall'), approved('room'), { id: 'old', venueNeedId: 'old', status: 'rejected', venueName: 'Old', createdAt: '2026-10-01' }]

function event(overrides = {}) {
  return {
    id: 'event', status: PLANNING, ownerUid: 'o', assignedCoordinatorUid: 'c', assignedStaffUids: ['v1', 't1'],
    equipment: { technicalSupportNeeded: true },
    arrangementApprovals: { technical: { decision: 'approved', byUid: 't1', at: 'x' } },
    venueBookingReadiness: { ready: true },
    ...overrides,
  }
}

describe('SPM-87 AC1 — the sign-offs a significant change marks', () => {
  it('each current approved venue booking and an approved technical sign-off; nothing else', () => {
    expect(recordedSignOffs(event(), bookings).map((item) => item.key)).toEqual(['venue:hall', 'venue:room', 'technical'])
    expect(recordedSignOffs(event({ arrangementApprovals: { technical: { decision: 'rejected' } } }), [])).toEqual([])
    // A booking already sent back is not marked again.
    expect(recordedSignOffs(event(), [approved('hall', { reapprovalRequestedAt: AT })]).map((item) => item.key)).toEqual(['technical'])
  })

  it.each([PLANNING, CONFIRMED, PREPARATION])('%s: marked, pending the Coordinator', (status) => {
    expect(signOffReviewOnChange(event({ status }), bookings, { fields: ['core.expectedAttendees'], at: AT })).toEqual({
      status: SIGN_OFF_REVIEW_PENDING,
      changedAt: AT,
      changedFields: ['core.expectedAttendees'],
      items: [
        { key: 'venue:hall', kind: 'venue', label: 'HALL', bookingId: 'hall' },
        { key: 'venue:room', kind: 'venue', label: 'ROOM', bookingId: 'room' },
        { key: 'technical', kind: 'technical', label: 'Technical arrangement' },
      ],
    })
  })

  it.each([SUBMITTED, UNDER_REVIEW])('%s: nothing is marked', (status) => {
    expect(signOffReviewOnChange(event({ status }), bookings, { fields: ['core.expectedAttendees'], at: AT })).toBeNull()
  })

  it('nothing to mark gives no review; a second change merges into the pending one', () => {
    expect(signOffReviewOnChange(event({ arrangementApprovals: {} }), [], { fields: ['core.durationHours'], at: AT })).toBeNull()
    const first = signOffReviewOnChange(event(), [approved('hall')], { fields: ['core.durationHours'], at: AT })
    const second = signOffReviewOnChange(event({ signOffReview: first }), [approved('hall'), approved('room')], { fields: ['core.expectedAttendees'], at: 'later' })
    expect(second.changedFields).toEqual(['core.durationHours', 'core.expectedAttendees'])
    expect(second.items.map((item) => item.key)).toEqual(['venue:hall', 'technical', 'venue:room'])
  })
})

describe('SPM-87 AC2, AC6 — the Coordinator’s choice', () => {
  const pending = event({ signOffReview: signOffReviewOnChange(event(), bookings, { fields: ['core.expectedAttendees'], at: AT }) })

  it('only the assigned Coordinator, at Planning, while the review is pending', () => {
    expect(canDecideSignOffReview(coordinator, pending)).toEqual({ allowed: true })
    for (const user of [otherCoordinator, owner, venueStaff]) expect(canDecideSignOffReview(user, pending).reason).toBe(NOT_PERMITTED)
    expect(canDecideSignOffReview(coordinator, event()).reason).toBe(NO_SIGN_OFF_REVIEW)
    expect(canDecideSignOffReview(coordinator, { ...pending, status: CONFIRMED }).reason).toBe(NO_SIGN_OFF_REVIEW)
  })

  it('validates the choice against the marked sign-offs; an empty list is "none"', () => {
    expect(normaliseSignOffChoice({ reapprove: ['technical', 'technical'] }, pending.signOffReview)).toEqual({ value: ['technical'], errors: {} })
    expect(normaliseSignOffChoice({ reapprove: [] }, pending.signOffReview)).toEqual({ value: [], errors: {} })
    expect(normaliseSignOffChoice({ reapprove: ['venue:old'] }, pending.signOffReview).errors.reapprove).toMatch(/venue:old/)
    expect(normaliseSignOffChoice({ reapprove: 'technical' }, pending.signOffReview).errors.reapprove).toBeTruthy()
    expect(normaliseSignOffChoice({ reapprove: [], extra: 1 }, pending.signOffReview).errors.extra).toBeTruthy()
    expect(normaliseSignOffChoice(null, pending.signOffReview).errors.request).toBeTruthy()
  })

  it('a choice sends back only the chosen sign-offs and is recorded with the labels for the history', () => {
    const decision = signOffReviewDecision(coordinator, pending, ['venue:room', 'technical'], AT)
    expect(decision.bookingIds).toEqual(['room'])
    expect(decision.technical).toBe(true)
    expect(decision.signOffReview).toMatchObject({ status: SIGN_OFF_REVIEW_DECIDED, reapprove: ['venue:room', 'technical'], decidedAt: AT, decidedByUid: 'c' })
    expect(decision.historyValues).toEqual({ oldValue: ['HALL', 'ROOM', 'Technical arrangement'], newValue: ['ROOM', 'Technical arrangement'] })
    const none = signOffReviewDecision(coordinator, pending, [], AT)
    expect(none).toMatchObject({ bookingIds: [], technical: false, historyValues: { newValue: 'None (existing approvals kept)' } })
  })

  it('the summary is for the assigned Coordinator only', () => {
    expect(signOffReviewSummary(coordinator, pending)).toMatchObject({ status: SIGN_OFF_REVIEW_PENDING, items: expect.any(Array) })
    for (const user of [otherCoordinator, owner, venueStaff]) expect(signOffReviewSummary(user, pending)).toBeNull()
  })
})

describe('SPM-87 AC3 — Preparation, like Confirmed, refuses a significant change while a cancellation request is open', () => {
  it.each([CONFIRMED, PREPARATION])('%s', (status) => {
    expect(significantChangeBlocked(event({ status, cancellationRequest: { status: 'pending' } }))).toBe(true)
    expect(significantChangeBlocked(event({ status }))).toBe(false)
  })
})

describe('SPM-87 AC4 — what blocks the safety check and Confirm', () => {
  const pending = event({ signOffReview: { status: SIGN_OFF_REVIEW_PENDING, items: [] } })
  const decided = event({ signOffReview: { status: SIGN_OFF_REVIEW_DECIDED, items: [], reapprove: [] } })

  it('an undecided review blocks submission for the safety check and Confirm', () => {
    expect(canSubmitForSafetyReview(coordinator, pending).reason).toBe(SIGN_OFF_REVIEW_UNDECIDED)
    expect(canTransition(coordinator, { ...pending, primaryVenueReadiness: { ready: true }, safetyReview: { status: 'approved' } }, CONFIRM).reason)
      .toBe(SIGN_OFF_REVIEW_UNDECIDED)
  })

  it('AC6: once decided with none sent back, the kept approvals count', () => {
    expect(canSubmitForSafetyReview(coordinator, decided)).toEqual({ allowed: true })
    expect(canTransition(coordinator, { ...decided, primaryVenueReadiness: { ready: true }, safetyReview: { status: 'approved' } }, CONFIRM).allowed).toBe(true)
  })

  it('a booking sent back is Awaiting approval: not ready, in its staff queue, approvable or rejectable again', () => {
    const sentBack = approved('hall', { reapprovalRequestedAt: AT })
    expect(awaitingReapproval(sentBack)).toBe(true)
    expect(venueBookingReadiness([sentBack])).toEqual({ ready: false, total: 1, approved: 0 })
    expect(venueBookingReadiness([approved('hall', { reapprovalRequestedAt: null })]).ready).toBe(true)
    expect(arrangementsApproved({ ...event(), venueBookingReadiness: venueBookingReadiness([sentBack]) })).toBe(false)
    expect(pendingVenueBookings([sentBack, approved('room')]).map((booking) => booking.id)).toEqual(['hall'])
    expect(canApproveVenueBooking(venueStaff, event(), sentBack)).toBe(true)
    expect(canRejectVenueBooking(venueStaff, event(), sentBack)).toBe(true)
    expect(canApproveVenueBooking(venueStaff, event(), approved('room'))).toBe(false)
    expect(canApproveVenueBooking(venueStaff, event({ status: CONFIRMED }), sentBack)).toBe(false)
    expect(venueBookingLabel(sentBack)).toBe('Awaiting re-approval')
    expect(venueBookingLabel(approved('room'))).toBe('Approved')
  })

  it('a Reserved equipment request can be re-confirmed once its technical sign-off is sent back', () => {
    const tech = { uid: 't1', roles: [TECHNICAL_STAFF] }
    const request = { id: 'r1', eventRequestId: 'event', assignedTechnicalStaffUid: 't1', status: EQUIPMENT_REQUEST_STATUS.RESERVED }
    expect(equipmentDecision(tech, event({ arrangementApprovals: {} }), request, RECONFIRM_EQUIPMENT_APPROVAL)).toEqual({ allowed: true })
    expect(equipmentDecision(tech, event(), request, RECONFIRM_EQUIPMENT_APPROVAL).allowed).toBe(false)
  })
})
