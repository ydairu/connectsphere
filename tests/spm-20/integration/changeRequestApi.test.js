// SPM-20 / SPM-40 API suite — real HTTP against the real Express app, middleware and transactions, with real
// venue bookings. Mocked token verification and in-memory persistence (backend/src/testing/fakeFirestore.js,
// through the E2E double's store); not database verification.

import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '../../../backend/src/app.js'
import { CHANGE_REQUESTED, CHANGE_REQUEST_DECIDED } from '../../../backend/src/controllers/requestController.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { CHANGE_REQUESTED_NOTICE, CHANGE_REQUEST_DECIDED_NOTICE } from '../../../shared/notifications.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { SAFETY_APPROVED, SAFETY_INVALIDATED } from '../../../shared/safetyReview.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, PREPARATION, RETURNED, SUBMITTED } from '../../../shared/status.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { coordinator, fixture, input, organiser } from '../../spm-14/fixtures.js'

const technical = { uid: 't1', roles: [TECHNICAL_STAFF], name: 'Tech One' }
const otherCoordinator = { uid: 'other-c', roles: [COORDINATOR], name: 'Other Coordinator' }
const colleague = { uid: 'o2', roles: [ORGANISER], name: 'Colleague', organisationId: 'org' }

let db
let app
beforeEach(() => {
  db = fixture()
  for (const user of [technical, otherCoordinator, colleague]) db.collectionData('users').set(user.uid, user)
  db.collectionData('users').set(organiser.uid, { ...organiser, organisationId: 'org' })
  Object.assign(db.store.get('event'), {
    organisationId: 'org',
    core: { ...db.store.get('event').core, purpose: 'Partner update' },
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
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
const notices = () => [...db.collectionData('notifications').values()]
const act = (uid, action) => request(app).post('/api/event-requests/event/transitions').set(auth(uid)).send({ action })
const view = (uid) => request(app).get('/api/requests/event').set(auth(uid))
const submit = (changes, uid = organiser.uid, extra = {}) => request(app).post('/api/requests/event/change-requests').set(auth(uid)).send({ changes, ...extra })
const decide = (decision, reason, uid = coordinator.uid) => request(app).post('/api/requests/event/change-requests/decision').set(auth(uid)).send({ decision, reason })
const assess = (uid = coordinator.uid) => request(app).get('/api/requests/event/change-requests/assessment').set(auth(uid))
const ATTENDANCE = { core: { expectedAttendees: 120 } }

async function approvedArrangements() {
  const hall = (await request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid)).send(input)).body.booking
  const assignee = booking(hall.id).assignedVenueStaffUid
  expect((await request(app).post(`/api/requests/event/venue-bookings/${hall.id}/actions`).set(auth(assignee)).send({ action: 'approve' })).status).toBe(200)
  expect((await act(technical.uid, 'approve_technical')).status).toBe(200)
  return hall
}

async function confirmed() {
  const hall = await approvedArrangements()
  expect((await request(app).put('/api/requests/event/primary-venue').set(auth(coordinator.uid)).send({ bookingId: hall.id, expectedPrimaryVenueBookingId: null })).status).toBe(200)
  event().safetyReview = { status: SAFETY_APPROVED }
  expect((await act(coordinator.uid, 'confirm')).status).toBe(200)
  return hall
}

describe('SPM-20 — the Organiser requests a change', () => {
  it('AC1: sent to the assigned Coordinator; no event field, booking or sign-off changes', async () => {
    const hall = await approvedArrangements()
    const before = structuredClone({ core: event().core, approvals: event().arrangementApprovals, booking: booking(hall.id) })
    const response = await submit(ATTENDANCE, organiser.uid, { reason: 'More guests confirmed' })
    expect(response.status).toBe(201)
    expect(response.body.changeRequest).toMatchObject({
      status: 'pending', reason: 'More guests confirmed', significant: true,
      changes: [{ field: 'core.expectedAttendees', current: 100, proposed: 120, significant: true }],
    })
    expect(response.body.canSubmitChangeRequest).toBe(false)
    expect({ core: event().core, approvals: event().arrangementApprovals, booking: booking(hall.id) }).toEqual(before)
    expect(event().signOffReview).toBeUndefined()
    expect(activity()).toContainEqual(expect.objectContaining({ type: CHANGE_REQUESTED, significant: true, resubmitted: false }))
    const notice = notices().find((item) => item.type === CHANGE_REQUESTED_NOTICE)
    expect(notice).toMatchObject({ recipientUid: coordinator.uid, reason: 'More guests confirmed' })
    expect(notice.message).toMatch(/significant change/)
  })

  it('SPM-40 AC1: the Coordinator sees the proposal; a colleague and staff do not', async () => {
    await submit(ATTENDANCE)
    expect((await view(coordinator.uid)).body.changeRequest).toMatchObject({ significant: true, decisions: ['accept', 'decline', 'return'] })
    expect((await view(organiser.uid)).body.changeRequest.decisions).toEqual([])
    expect((await view(colleague.uid)).body.changeRequest).toBeNull()
  })

  it.each([DRAFT, RETURNED, COMPLETED, CANCELLED])('%s: not eligible', async (status) => {
    event().status = status
    expect((await submit(ATTENDANCE)).status).toBe(409)
    expect(event().changeRequests).toBeUndefined()
  })

  it('only the owning Organiser; a colleague 403, the Coordinator 403, another Coordinator 404', async () => {
    expect((await submit(ATTENDANCE, colleague.uid)).status).toBe(403)
    expect((await submit(ATTENDANCE, coordinator.uid)).status).toBe(403)
    expect((await submit(ATTENDANCE, otherCoordinator.uid)).status).toBe(404)
  })

  it('[Team decision pending] refused with no Coordinator, a second open request, an open cancellation or a started event', async () => {
    event().assignedCoordinatorUid = null
    event().status = SUBMITTED
    expect((await submit(ATTENDANCE)).body.reason).toBe('no_coordinator_assigned')
    event().assignedCoordinatorUid = coordinator.uid
    expect((await submit(ATTENDANCE)).status).toBe(201)
    expect((await submit({ core: { title: 'New' } })).body.reason).toBe('change_request_already_pending')
    delete event().changeRequests
    event().cancellationRequest = { status: 'pending' }
    expect((await submit(ATTENDANCE)).body.reason).toBe('cancellation_request_open')
    delete event().cancellationRequest
    event().core.preferredDateTime = '2020-01-01T00:00:00.000Z'
    expect((await submit(ATTENDANCE)).body.reason).toBe('event_started')
  })

  it('invalid, unpermitted or empty changes are refused with field errors and no write', async () => {
    const bad = await submit({ core: { expectedAttendees: -1, title: ' ' }, registration: { enabled: true }, internal: { planningNotes: 'x' } })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.errors).sort()).toEqual(['core.expectedAttendees', 'core.title', 'internal.planningNotes', 'registration.enabled'])
    expect((await submit({ core: { expectedAttendees: 100 } })).body.errors.changes).toBeTruthy()
    expect((await request(app).post('/api/requests/event/change-requests').set(auth(organiser.uid)).send({ status: 'confirmed', changes: ATTENDANCE })).body.errors.status).toBeTruthy()
    expect(event().changeRequests).toBeUndefined()
  })
})

describe('SPM-20 / SPM-40 — the Coordinator decides', () => {
  it('only the assigned Coordinator; nothing to decide or an unknown decision is refused', async () => {
    expect((await decide('accept')).body.reason).toBe('no_open_change_request')
    await submit(ATTENDANCE)
    expect((await decide('accept', undefined, organiser.uid)).status).toBe(403)
    expect((await decide('accept', undefined, otherCoordinator.uid)).status).toBe(404)
    expect((await decide('approve')).status).toBe(400)
    expect(event().core.expectedAttendees).toBe(100)
  })

  it('SPM-20 AC3: accepting an ordinary change applies it with no re-review', async () => {
    await confirmed()
    await submit({ core: { description: 'New wording' } })
    expect((await view(coordinator.uid)).body.changeRequest.significant).toBe(false)
    const response = await decide('accept')
    expect(response.status).toBe(200)
    expect(event()).toMatchObject({ status: CONFIRMED, core: { description: 'New wording' }, safetyReview: { status: SAFETY_APPROVED } })
    expect(event().signOffReview).toBeUndefined()
    expect(activity()).toContainEqual(expect.objectContaining({ type: 'field_changed', field: 'core.description', actor: expect.objectContaining({ uid: coordinator.uid }) }))
    expect(activity()).toContainEqual(expect.objectContaining({ type: CHANGE_REQUEST_DECIDED, decision: 'accept' }))
    expect(notices().find((item) => item.type === CHANGE_REQUEST_DECIDED_NOTICE)).toMatchObject({ recipientUid: organiser.uid })
  })

  it.each([[CONFIRMED], [PREPARATION]])('SPM-20 AC7, SPM-40 AC3, AC4: a significant change to a %s event returns it to Planning; nothing is released or reset', async (status) => {
    const hall = await confirmed()
    if (status === PREPARATION) expect((await act(coordinator.uid, 'start_preparation')).status).toBe(200)
    await submit(ATTENDANCE)
    expect(event().status).toBe(status)
    expect((await decide('accept')).status).toBe(200)
    expect(event()).toMatchObject({
      status: PLANNING, core: { expectedAttendees: 120 }, safetyReview: { status: SAFETY_INVALIDATED },
      signOffReview: { status: 'pending' }, arrangementApprovals: { technical: { decision: 'approved' } },
    })
    expect(booking(hall.id).status).toBe('approved')
    expect(activity().filter((entry) => entry.type === STATUS_CHANGED).at(-1)).toMatchObject({ fromStatus: status, toStatus: PLANNING, reason: 'significant_change' })
    expect(activity()).toContainEqual(expect.objectContaining({ type: 'field_changed', field: 'core.expectedAttendees', significant: true }))
    // It must pass the safety checkpoint again, after the Coordinator's arrangement review (SPM-87).
    expect((await act(coordinator.uid, 'confirm')).status).toBe(409)
  })

  it('SPM-41: an accepted new date notifies registered Attendees', async () => {
    db.collectionData('eventRegistrations').set('event_a1', { eventRequestId: 'event', attendeeUid: 'a1', status: 'registered' })
    await submit({ core: { preferredDateTime: '2027-03-02T10:00:00.000Z' } })
    expect((await decide('accept')).status).toBe(200)
    expect(notices().some((item) => item.recipientUid === 'a1')).toBe(true)
  })

  it('SPM-40 AC5: declining needs a reason, changes no field, and the Organiser may ask again', async () => {
    await submit(ATTENDANCE)
    expect((await decide('decline')).body.errors.reason).toBeTruthy()
    expect((await decide('decline', 'No larger venue is available')).status).toBe(200)
    expect(event().core.expectedAttendees).toBe(100)
    expect(notices().find((item) => item.type === CHANGE_REQUEST_DECIDED_NOTICE)).toMatchObject({ recipientUid: organiser.uid, reason: 'No larger venue is available' })
    const organiserView = (await view(organiser.uid)).body
    expect(organiserView.changeRequest).toMatchObject({ status: 'declined', decisionReason: 'No larger venue is available' })
    expect(organiserView.canSubmitChangeRequest).toBe(true)
    expect((await submit({ core: { expectedAttendees: 110 } })).status).toBe(201)
    expect(event().changeRequests).toHaveLength(2)
  })

  it('SPM-40 AC5: a returned request is modified and resubmitted as the same request, then accepted', async () => {
    await submit(ATTENDANCE)
    expect((await decide('return')).body.errors.reason).toBeTruthy()
    expect((await decide('return', 'Please lower the attendance')).status).toBe(200)
    expect((await decide('accept')).body.reason).toBe('no_open_change_request')
    expect((await view(organiser.uid)).body).toMatchObject({ canSubmitChangeRequest: true, changeRequest: { status: 'returned' } })
    expect((await submit({ core: { expectedAttendees: 110 } })).status).toBe(201)
    expect(event().changeRequests).toHaveLength(1)
    expect(activity()).toContainEqual(expect.objectContaining({ type: CHANGE_REQUESTED, resubmitted: true }))
    expect((await decide('accept')).status).toBe(200)
    expect(event().core.expectedAttendees).toBe(110)
  })

  it('a returned request may be declined, so it is not left open for good', async () => {
    await submit(ATTENDANCE)
    await decide('return', 'Please lower the attendance')
    expect((await decide('decline', 'No longer possible')).status).toBe(200)
    expect(event().changeRequests[0].status).toBe('declined')
  })

  it('SPM-10 AC7: a significant change waits for an open cancellation request; an ordinary one does not', async () => {
    await confirmed()
    await submit(ATTENDANCE)
    event().cancellationRequest = { status: 'pending' }
    expect((await decide('accept')).body.reason).toBe('cancellation_request_open')
    expect(event().core.expectedAttendees).toBe(100)
    delete event().cancellationRequest
    await decide('decline', 'x')
    await submit({ core: { description: 'New wording' } })
    event().cancellationRequest = { status: 'pending' }
    expect((await decide('accept')).status).toBe(200)
  })

  it('[Team decision pending] a pending significant request blocks the safety check and Confirm until decided', async () => {
    await approvedArrangements()
    expect((await view(coordinator.uid)).body.availableActions).toContain('submit_safety_review')
    await submit(ATTENDANCE)
    expect((await view(coordinator.uid)).body.availableActions).not.toContain('submit_safety_review')
    expect((await act(coordinator.uid, 'submit_safety_review')).body.reason).toBe('significant_change_request_pending')
    event().safetyReview = { status: SAFETY_APPROVED }
    event().primaryVenue = null
    expect((await act(coordinator.uid, 'confirm')).body.reason).toBe('significant_change_request_pending')
    delete event().safetyReview
    // Returned to the Organiser: it blocks nothing.
    await decide('return', 'Please lower it')
    expect((await act(coordinator.uid, 'submit_safety_review')).status).toBe(200)
  })

  it('[Team decision pending] an ordinary pending request blocks nothing', async () => {
    await approvedArrangements()
    await submit({ core: { description: 'New wording' } })
    expect((await act(coordinator.uid, 'submit_safety_review')).status).toBe(200)
  })

  it('an open request closes with its event', async () => {
    event().status = PLANNING
    await submit(ATTENDANCE)
    const rejected = await request(app).post('/api/event-requests/event/transitions').set(auth(coordinator.uid)).send({ action: 'reject', reason: 'Cannot be met' })
    expect(rejected.status).toBe(200)
    expect(event().changeRequests[0]).toMatchObject({ status: 'closed', closedAt: expect.any(String) })
    expect((await decide('accept')).status).toBe(409)
  })
})

describe('SPM-40 AC1, AC2 — assessing the proposal', () => {
  it('lists the arrangements it may affect and checks the booked venue against the proposal', async () => {
    const hall = await approvedArrangements()
    await submit(ATTENDANCE)
    const response = await assess()
    expect(response.status).toBe(200)
    expect(response.body.affected.map((item) => item.key)).toEqual([`venue:${hall.id}`])
    expect(response.body.venues).toEqual([expect.objectContaining({
      bookingId: hall.id, venueName: 'Hall', problems: expect.arrayContaining([expect.objectContaining({ check: 'capacity' })]),
    })])
  })

  it('a date change may affect the venue and technical arrangements; its own reservation is not a clash', async () => {
    await approvedArrangements()
    await submit({ core: { durationHours: 2.5 } })
    const { body } = await assess()
    expect(body.affected.map((item) => item.kind).sort()).toEqual(['technical', 'venue'])
    expect(body.venues[0].problems.some((problem) => problem.check === 'availability')).toBe(false)
  })

  it('raises the layout only when the request changes it', async () => {
    await approvedArrangements()
    event().venue.layoutPreference = 'Not a supported layout'
    await submit(ATTENDANCE)
    const unchanged = (await assess()).body.venues[0]
    expect([...unchanged.problems, ...unchanged.warnings].some((finding) => finding.check === 'layout')).toBe(false)
    await decide('decline', 'No')
    await submit({ venue: { layoutPreference: 'Another unsupported layout' } })
    const changed = (await assess()).body.venues[0]
    expect([...changed.problems, ...changed.warnings].some((finding) => finding.check === 'layout')).toBe(true)
  })

  it('only the assigned Coordinator', async () => {
    await submit(ATTENDANCE)
    expect((await assess(organiser.uid)).status).toBe(403)
    expect((await assess(otherCoordinator.uid)).status).toBe(404)
  })
})
