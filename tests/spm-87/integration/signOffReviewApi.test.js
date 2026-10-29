// SPM-87 API suite — real HTTP against the real Express app and middleware, with the real venue booking,
// sign-off, safety and status transactions. Mocked token verification and in-memory persistence
// (backend/src/testing/fakeFirestore.js, through the E2E double's store); not database verification.
//
// The event has two approved venue bookings (Hall, Room, through the real booking routes) and an approved
// manual technical sign-off before each significant change.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { SIGN_OFF_REVIEW_DECIDED } from '../../../backend/src/services/signOffReviewService.js'
import { SIGNIFICANT_CHANGE_NOTICE, SIGN_OFF_REAPPROVAL_REQUESTED_NOTICE } from '../../../shared/notifications.js'
import { COORDINATOR, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { SAFETY_APPROVED, SAFETY_INVALIDATED } from '../../../shared/safetyReview.js'
import { SIGN_OFF_REVIEW_FIELD } from '../../../shared/signOffReview.js'
import { CONFIRMED, PLANNING, PREPARATION } from '../../../shared/status.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { coordinator, fixture, input, organiser } from '../../spm-14/fixtures.js'

const technical = { uid: 't1', roles: [TECHNICAL_STAFF], name: 'Tech One' }
const otherCoordinator = { uid: 'other-c', roles: [COORDINATOR], name: 'Other Coordinator' }

let db
let app
beforeEach(() => {
  db = fixture()
  db.collectionData('users').set(technical.uid, technical)
  db.collectionData('users').set(otherCoordinator.uid, otherCoordinator)
  Object.assign(db.store.get('event'), {
    equipment: { requirements: [], technicalSupportNeeded: true },
    assignedStaffUids: [technical.uid],
    registration: { enabled: false },
  })
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db) })
})

const auth = (uid) => ({ Authorization: `Bearer test:${uid}` })
const event = () => db.store.get('event')
const booking = (id) => db.collectionData('venueBookingRequests').get(id)
const hold = (id) => db.collectionData('venueAvailability').get(booking(id).holdId)
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
const notices = () => [...db.collectionData('notifications').values()]
const act = (uid, action) => request(app).post('/api/event-requests/event/transitions').set(auth(uid)).send({ action })
const patch = (body, uid = coordinator.uid) => request(app).patch('/api/requests/event').set(auth(uid)).send(body)
const decide = (reapprove, uid = coordinator.uid) => request(app).post('/api/requests/event/sign-off-review').set(auth(uid)).send({ reapprove })
const view = (uid = coordinator.uid) => request(app).get('/api/requests/event').set(auth(uid))
const bookingAction = (id, action, extra = {}) => request(app).post(`/api/requests/event/venue-bookings/${id}/actions`)
  .set(auth(booking(id).assignedVenueStaffUid)).send({ action, ...extra })

// Two approved venues and the technical sign-off, through the real routes.
async function approvedArrangements() {
  const hall = (await request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid)).send(input)).body.booking
  const room = (await request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid))
    .send({ ...input, venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
  expect((await bookingAction(hall.id, 'approve')).status).toBe(200)
  expect((await bookingAction(room.id, 'approve')).status).toBe(200)
  expect((await act(technical.uid, 'approve_technical')).status).toBe(200)
  return { hall, room }
}

// Confirm the event: primary venue, a recorded safety approval (SPM-91/92 is tested elsewhere) and Confirm.
async function confirmed(hall) {
  expect((await request(app).put('/api/requests/event/primary-venue').set(auth(coordinator.uid))
    .send({ bookingId: hall.id, expectedPrimaryVenueBookingId: null })).status).toBe(200)
  event().safetyReview = { status: SAFETY_APPROVED }
  expect((await act(coordinator.uid, 'confirm')).status).toBe(200)
}

describe('SPM-87 AC1 — a significant change keeps the sign-offs and marks them', () => {
  it('Planning: every recorded sign-off is kept, marked Changed since approval, and the assigned staff are notified', async () => {
    const { hall, room } = await approvedArrangements()
    const response = await patch({ core: { expectedAttendees: 90 } })
    expect(response.status).toBe(200)

    expect(booking(hall.id).status).toBe('approved')
    expect(booking(room.id).status).toBe('approved')
    expect(event().arrangementApprovals.technical).toMatchObject({ decision: 'approved' })
    expect(response.body.arrangements.venue.decision).toBe('approved')
    expect(response.body.signOffReview).toMatchObject({
      status: 'pending',
      changedFields: ['core.expectedAttendees'],
      items: [
        { key: `venue:${hall.id}`, kind: 'venue', label: 'Hall' },
        { key: `venue:${room.id}`, kind: 'venue', label: 'Room' },
        { key: 'technical', kind: 'technical', label: 'Technical arrangement' },
      ],
    })
    const recipients = notices().filter((notice) => notice.type === SIGNIFICANT_CHANGE_NOTICE).map((notice) => notice.recipientUid).sort()
    expect(recipients).toEqual([booking(hall.id).assignedVenueStaffUid, booking(room.id).assignedVenueStaffUid, technical.uid].sort())
    expect(notices().find((notice) => notice.type === SIGNIFICANT_CHANGE_NOTICE).message).toMatch(/Changed since approval/)
  })

  it('the review is shown to the assigned Coordinator only', async () => {
    await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    expect((await view()).body.signOffReview.status).toBe('pending')
    expect((await view(organiser.uid)).body.signOffReview).toBeNull()
    expect((await view(technical.uid)).body.signOffReview).toBeNull()
  })

  it('a second change before the Coordinator decides adds to the same review', async () => {
    await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    await patch({ core: { durationHours: 2.5 } })
    expect(event().signOffReview.changedFields).toEqual(['core.expectedAttendees', 'core.durationHours'])
    expect(event().signOffReview.items).toHaveLength(3)
  })
})

describe('SPM-87 AC4 — nothing goes forward while a sign-off is undecided or Awaiting approval', () => {
  it('before the choice, submitting for the safety check and confirming are refused', async () => {
    await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    expect((await act(coordinator.uid, 'submit_safety_review')).body.reason).toBe('sign_off_review_pending')
    expect((await act(coordinator.uid, 'confirm')).body.reason).toBe('sign_off_review_pending')
    expect((await view()).body.availableActions).not.toContain('submit_safety_review')
  })
})

describe('SPM-87 AC2, AC5 — the Coordinator sends back only the chosen sign-offs', () => {
  it('only the chosen venue booking and the technical sign-off return to Awaiting approval; the choice is in the change history', async () => {
    const { hall, room } = await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    const response = await decide([`venue:${hall.id}`, 'technical'])
    expect(response.status).toBe(200)

    expect(booking(hall.id)).toMatchObject({ status: 'approved', reapprovalRequestedAt: expect.any(String), reapprovalRequestedByUid: coordinator.uid })
    expect(hold(hall.id).status).toBe('confirmed_booking')
    expect(booking(room.id).reapprovalRequestedAt).toBeUndefined()
    expect(event().arrangementApprovals.technical).toBeUndefined()
    expect(response.body.signOffReview).toMatchObject({ status: 'decided', reapprove: [`venue:${hall.id}`, 'technical'] })
    expect(response.body.venueBookingReadiness).toMatchObject({ ready: false, total: 2, approved: 1 })
    expect(response.body.arrangements.technical.decision).toBeNull()

    // AC5: recorded in the change history, for the assigned Coordinator.
    expect(activity()).toContainEqual(expect.objectContaining({ type: SIGN_OFF_REVIEW_DECIDED, reapprove: [`venue:${hall.id}`, 'technical'] }))
    const history = (await request(app).get('/api/requests/event/history').set(auth(coordinator.uid))).body.entries
    expect(history).toContainEqual(expect.objectContaining({
      field: SIGN_OFF_REVIEW_FIELD, oldValue: ['Hall', 'Room', 'Technical arrangement'], newValue: ['Hall', 'Technical arrangement'],
      actor: expect.objectContaining({ name: coordinator.name, role: COORDINATOR }),
    }))
    const organiserHistory = (await request(app).get('/api/requests/event/history').set(auth(organiser.uid))).body.entries
    expect(organiserHistory.some((entry) => entry.field === SIGN_OFF_REVIEW_FIELD)).toBe(false)

    // The reviewers are told what to review again.
    const reapproval = notices().filter((notice) => notice.type === SIGN_OFF_REAPPROVAL_REQUESTED_NOTICE)
    expect(reapproval.map((notice) => notice.recipientUid).sort()).toEqual([booking(hall.id).assignedVenueStaffUid, technical.uid].sort())
    expect(reapproval.find((notice) => notice.recipientUid === technical.uid).message).toMatch(/technical arrangement/)
  })

  it('AC4: an Awaiting approval sign-off still blocks the safety check and Confirm; re-approving it unblocks them', async () => {
    const { hall } = await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    await decide([`venue:${hall.id}`, 'technical'])
    expect((await act(coordinator.uid, 'submit_safety_review')).body.reason).toBe('arrangements_not_ready')
    expect((await act(coordinator.uid, 'confirm')).body.reason).toBe('arrangements_not_approved')

    // The sent-back booking is back in its Venue Staff member's queue, and is approved again.
    const queue = (await request(app).get('/api/venues/booking-requests').set(auth(booking(hall.id).assignedVenueStaffUid))).body.bookings
    expect(queue).toContainEqual(expect.objectContaining({ id: hall.id, awaitingReapproval: true }))
    const reapproved = await bookingAction(hall.id, 'approve')
    expect(reapproved.status).toBe(200)
    expect(booking(hall.id)).toMatchObject({ status: 'approved', reapprovalRequestedAt: null, reapprovedAt: expect.any(String) })
    expect(activity()).toContainEqual(expect.objectContaining({ type: 'venue_booking_reapproved', bookingRequestId: hall.id }))
    expect((await act(coordinator.uid, 'submit_safety_review')).body.reason).toBe('arrangements_not_ready')
    expect((await act(technical.uid, 'approve_technical')).status).toBe(200)
    expect((await act(coordinator.uid, 'submit_safety_review')).status).toBe(200)
  })

  it('a sent-back booking can be rejected instead: its reservation is released and it stops being the primary venue', async () => {
    const { hall } = await approvedArrangements()
    expect((await request(app).put('/api/requests/event/primary-venue').set(auth(coordinator.uid))
      .send({ bookingId: hall.id, expectedPrimaryVenueBookingId: null })).status).toBe(200)
    await patch({ core: { expectedAttendees: 90 } })
    await decide([`venue:${hall.id}`])
    const rejected = await bookingAction(hall.id, 'reject', { reason: 'The new attendance needs a bigger room.' })
    expect(rejected.status).toBe(200)
    expect(booking(hall.id)).toMatchObject({ status: 'rejected', reapprovalRequestedAt: null })
    expect(hold(hall.id).lifecycleStatus).toBe('removed')
    expect(event()).toMatchObject({ primaryVenue: null, primaryVenueSelectionRequired: true })
  })

  it('a sent-back booking that no longer fits the event cannot be approved again', async () => {
    const { hall } = await approvedArrangements()
    await patch({ core: { expectedAttendees: 35 } })
    await decide([`venue:${hall.id}`])
    const refused = await bookingAction(hall.id, 'approve')
    expect(refused.status).toBe(409)
    expect(booking(hall.id).reapprovalRequestedAt).toEqual(expect.any(String))
  })

  it('refuses another user, an invalid choice and a second choice, writing nothing', async () => {
    await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    const before = structuredClone(event())
    expect((await decide([], organiser.uid)).status).toBe(403)
    expect((await decide([], technical.uid)).status).toBe(403)
    expect((await decide([], otherCoordinator.uid)).status).toBe(404)
    expect((await request(app).post('/api/requests/event/sign-off-review').set(auth(coordinator.uid)).send({ reapprove: 'technical' })).status).toBe(400)
    const unknown = await decide(['venue:not-a-booking'])
    expect(unknown.status).toBe(400)
    expect(unknown.body.errors.reapprove).toMatch(/not-a-booking/)
    expect(event()).toEqual(before)
    expect((await decide([])).status).toBe(200)
    expect((await decide(['technical'])).body.reason).toBe('no_sign_off_review')
  })
})

describe('SPM-87 AC6 — the Coordinator records that none need re-approval', () => {
  it('the existing approvals stay valid and do not block the safety check; Confirm still needs the safety approval', async () => {
    const { hall } = await approvedArrangements()
    await patch({ core: { expectedAttendees: 90 } })
    const response = await decide([])
    expect(response.status).toBe(200)
    expect(response.body.signOffReview).toMatchObject({ status: 'decided', reapprove: [] })
    expect(event().arrangementApprovals.technical).toMatchObject({ decision: 'approved' })
    expect(booking(hall.id).reapprovalRequestedAt).toBeUndefined()
    expect(notices().filter((notice) => notice.type === SIGN_OFF_REAPPROVAL_REQUESTED_NOTICE)).toEqual([])
    const history = (await request(app).get('/api/requests/event/history').set(auth(coordinator.uid))).body.entries
    expect(history).toContainEqual(expect.objectContaining({ field: SIGN_OFF_REVIEW_FIELD, newValue: 'None (existing approvals kept)' }))

    expect((await request(app).put('/api/requests/event/primary-venue').set(auth(coordinator.uid))
      .send({ bookingId: hall.id, expectedPrimaryVenueBookingId: null })).status).toBe(200)
    expect((await act(coordinator.uid, 'confirm')).body.reason).toBe('safety_approval_required')
    expect((await act(coordinator.uid, 'submit_safety_review')).status).toBe(200)
  })
})

describe('SPM-87 AC3 — a Confirmed or Preparation event moves back to Planning and its safety approval is cleared', () => {
  it('Confirmed', async () => {
    const { hall } = await approvedArrangements()
    await confirmed(hall)
    const response = await patch({ core: { expectedAttendees: 90 } })
    expect(response.status).toBe(200)
    expect(event()).toMatchObject({ status: PLANNING, safetyReview: { status: SAFETY_INVALIDATED }, signOffReview: { status: 'pending' } })
    expect(activity().filter((entry) => entry.type === STATUS_CHANGED).at(-1)).toMatchObject({ fromStatus: CONFIRMED, toStatus: PLANNING, reason: 'significant_change' })
  })

  it('Preparation', async () => {
    const { hall } = await approvedArrangements()
    await confirmed(hall)
    expect((await act(coordinator.uid, 'start_preparation')).status).toBe(200)
    const response = await patch({ core: { durationHours: 2.5 } })
    expect(response.status).toBe(200)
    expect(event()).toMatchObject({ status: PLANNING, safetyReview: { status: SAFETY_INVALIDATED }, signOffReview: { status: 'pending' } })
    expect(activity().filter((entry) => entry.type === STATUS_CHANGED).at(-1)).toMatchObject({ fromStatus: PREPARATION, toStatus: PLANNING })
    // The way back: decide, re-approve if needed, a new safety check, then Confirm.
    expect((await decide([])).status).toBe(200)
    expect((await act(coordinator.uid, 'submit_safety_review')).status).toBe(200)
  })
})
