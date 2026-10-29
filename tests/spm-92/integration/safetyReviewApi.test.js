// SPM-66 / SPM-91 / SPM-92 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP
// against the real Express app, authenticate middleware and transactions; mocked token verification and
// persistence (backend/src/testing/fakeFirestore.js). Not database verification, and no live-project run.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { SAFETY_REVIEW_SUBMITTED } from '../../../backend/src/services/statusTransitionService.js'
import { SAFETY_REVIEW_DECIDED } from '../../../backend/src/services/safetyReviewService.js'
import {
  REQUEST_CONFIRMED_NOTICE,
  SAFETY_APPROVED_NOTICE,
  SAFETY_CHANGES_REQUESTED_NOTICE,
  SAFETY_REJECTED_NOTICE,
} from '../../../shared/notifications.js'
import { APPROVE_TECHNICAL } from '../../../shared/requestActions.js'
import {
  APPROVE_SAFETY,
  CHECK_CONCERN,
  CHECK_SATISFACTORY,
  INVALIDATED_BY_SIGNIFICANT_CHANGE,
  REJECT_SAFETY_ARRANGEMENT,
  REQUEST_SAFETY_CHANGES,
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_CHECKLIST_IDS,
  SAFETY_INVALIDATED,
  SAFETY_REJECTED,
  SAFETY_REVIEW_PENDING,
  SUBMIT_SAFETY_REVIEW,
} from '../../../shared/safetyReview.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { CONFIRM, SAFETY_APPROVAL_REQUIRED } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { coordinator, coordinator2, organiserA1, organiserA2, safetyOfficer, venueStaff, technicalStaff, attendee } = SEED_ACCOUNTS
const EVENT_ID = 'seed-req-a1-planning'
const api = createCancellationApi()
const ALL_SATISFACTORY = Object.fromEntries(SAFETY_CHECKLIST_IDS.map((id) => [id, { result: CHECK_SATISFACTORY, comment: '' }]))

beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

const act = (account, action, reason) => api.act(account, action, reason, EVENT_ID)
const view = (account) => api.view(account, EVENT_ID)
const review = (account, body) => api.call('POST', `/api/requests/${EVENT_ID}/safety-review`, account, body)
const venues = (account) => api.call('GET', `/api/requests/${EVENT_ID}/safety-review/venues`, account)
const history = (account) => api.call('GET', `/api/requests/${EVENT_ID}/history`, account)
const listIds = async (account) => (await api.list(account)).map((request) => request.id)

// The arrangements SPM-91 AC2 requires: an approved venue booking and the technical sign-off.
async function approveArrangements() {
  api.putDocument('venues', 'safety-hall', {
    name: 'Safety Hall', maximumCapacity: 60, supportedLayouts: ['Theatre'], accessibilityFeatures: ['Wheelchair access'],
    facilities: ['Projector'], operatingHours: 'Daily 08:00-22:00',
  })
  api.putDocument('venueBookingRequests', 'safety-booking', {
    eventRequestId: EVENT_ID, status: 'approved', venueId: 'safety-hall', venueName: 'Safety Hall', attendeeCount: 80,
    requirements: 'Theatre layout', specialRequests: '', holdId: 'safety-hold', startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
  })
  api.putDocument('venueAvailability', 'safety-hold', {
    eventRequestId: EVENT_ID, bookingRequestId: 'safety-booking', venueId: 'safety-hall',
    status: 'confirmed_booking', lifecycleStatus: 'active',
    startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z',
  })
  expect((await act(technicalStaff, APPROVE_TECHNICAL)).status).toBe(200)
}

async function submitForReview() {
  await approveArrangements()
  const response = await act(coordinator, SUBMIT_SAFETY_REVIEW)
  expect(response.status).toBe(200)
  return response
}

describe('SPM-91 — submitting an event for safety review', () => {
  it('AC2: refused until every venue booking and technical arrangement is approved, and not offered', async () => {
    expect((await view(coordinator)).json.availableActions).not.toContain(SUBMIT_SAFETY_REVIEW)
    const refused = await act(coordinator, SUBMIT_SAFETY_REVIEW)
    expect(refused).toMatchObject({ status: 409, json: { reason: 'arrangements_not_ready' } })
    expect(api.stored(EVENT_ID).safetyReview).toBeUndefined()
  })

  it('AC1: only the assigned Coordinator may submit', async () => {
    await approveArrangements()
    expect((await act(coordinator2, SUBMIT_SAFETY_REVIEW)).status).toBe(404)
    for (const account of [organiserA1, venueStaff, technicalStaff]) {
      expect((await act(account, SUBMIT_SAFETY_REVIEW)).status, account.uid).toBe(403)
    }
    expect(api.stored(EVENT_ID).safetyReview).toBeUndefined()
  })

  it('AC3: the event enters the queue, shows "Pending safety check" and stays in Planning', async () => {
    await approveArrangements()
    expect((await view(coordinator)).json.availableActions).toContain(SUBMIT_SAFETY_REVIEW)
    const response = await act(coordinator, SUBMIT_SAFETY_REVIEW)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(PLANNING)
    expect(response.json.safetyReview).toMatchObject({ status: SAFETY_REVIEW_PENDING, reviews: [] })
    expect(response.json.availableActions).not.toContain(SUBMIT_SAFETY_REVIEW)
    expect(api.activity(EVENT_ID)).toContainEqual(expect.objectContaining({ type: SAFETY_REVIEW_SUBMITTED, resubmission: false, actor: expect.objectContaining({ uid: coordinator.uid }) }))
    expect((await api.list(coordinator)).find((request) => request.id === EVENT_ID).safetyReviewStatus).toBe(SAFETY_REVIEW_PENDING)
    expect((await api.list(organiserA1)).find((request) => request.id === EVENT_ID).safetyReviewStatus).toBe(SAFETY_REVIEW_PENDING)
    // A colleague in the same organisation may see the event, but not its safety review.
    expect((await api.list(organiserA2)).find((request) => request.id === EVENT_ID).safetyReviewStatus).toBeNull()
    expect((await act(coordinator, SUBMIT_SAFETY_REVIEW)).json.reason).toBe('safety_review_already_pending')
  })

  it('AC4: Confirm is refused without a valid safety approval', async () => {
    await submitForReview()
    expect((await view(coordinator)).json.availableActions).not.toContain(CONFIRM)
    expect((await act(coordinator, CONFIRM)).json).toMatchObject({ reason: SAFETY_APPROVAL_REQUIRED })
    expect(api.stored(EVENT_ID).status).toBe(PLANNING)
  })

  it('AC5: after changes are requested the Coordinator resubmits, and earlier reviews are kept', async () => {
    await submitForReview()
    expect((await review(safetyOfficer, { outcome: REQUEST_SAFETY_CHANGES, checklist: ALL_SATISFACTORY, comments: 'Add stewards' })).status).toBe(200)
    const resubmitted = await act(coordinator, SUBMIT_SAFETY_REVIEW)
    expect(resubmitted.status).toBe(200)
    expect(resubmitted.json.safetyReview.status).toBe(SAFETY_REVIEW_PENDING)
    expect(resubmitted.json.safetyReview.reviews).toHaveLength(1)
    expect(api.activity(EVENT_ID).filter((entry) => entry.type === SAFETY_REVIEW_SUBMITTED).map((entry) => entry.resubmission)).toEqual([false, true])
    // The Safety Officer sees the earlier review when the event is back in the queue.
    expect((await view(safetyOfficer)).json.safetyReview.reviews[0]).toMatchObject({ outcome: REQUEST_SAFETY_CHANGES, comments: 'Add stewards' })
  })

  it('[Team decision pending] a significant change while the check is pending takes the event out of the queue', async () => {
    await submitForReview()
    expect((await api.call('PATCH', `/api/requests/${EVENT_ID}`, coordinator, { core: { expectedAttendees: 150 } })).status).toBe(200)
    expect(api.stored(EVENT_ID).safetyReview.status).toBe(SAFETY_INVALIDATED)
    expect(await listIds(safetyOfficer)).toEqual([])
  })

  it('AC6: a significant change to a safety-approved event invalidates the approval', async () => {
    await submitForReview()
    await review(safetyOfficer, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })
    const saved = await api.call('PATCH', `/api/requests/${EVENT_ID}`, coordinator, { core: { expectedAttendees: 150 } })
    expect(saved.status).toBe(200)
    expect(api.stored(EVENT_ID).safetyReview).toMatchObject({ status: SAFETY_INVALIDATED, invalidatedReason: INVALIDATED_BY_SIGNIFICANT_CHANGE })
    expect(saved.json.safetyReview.status).toBe(SAFETY_INVALIDATED)
    expect((await act(coordinator, CONFIRM)).json.reason).toBe('arrangements_not_approved')
  })
})

describe('SPM-66 — the Safety Officer reaches events only through the queue', () => {
  it('AC5: nothing is visible before submission, by list, link, history or venue details', async () => {
    await approveArrangements()
    expect(await listIds(safetyOfficer)).toEqual([])
    expect((await view(safetyOfficer)).status).toBe(403)
    expect((await history(safetyOfficer)).status).toBe(403)
    expect((await venues(safetyOfficer)).status).toBe(403)
    // Confirmed and Preparation events are not in the queue either.
    expect((await api.view(safetyOfficer, 'seed-req-a1-confirmed')).status).toBe(403)
  })

  it('AC2: a queued event shows attendance, layout, accessibility and equipment, and nothing internal', async () => {
    await submitForReview()
    expect(await listIds(safetyOfficer)).toEqual([EVENT_ID])
    const { json } = await view(safetyOfficer)
    expect(Object.keys(json.request).sort()).toEqual(['core', 'equipment', 'id', 'status', 'venue'])
    expect(json.request.core.expectedAttendees).toBe(80)
    expect(json.request.venue).toMatchObject({ layoutPreference: 'theatre', accessibilityRequired: true })
    expect(json.request.equipment.requirements).toEqual(['projector', 'wireless microphone'])
    expect(JSON.stringify(json)).not.toMatch(/Seed internal note/)
    expect(json.canDecideSafetyReview).toBe(true)
  })

  it('AC2: the booked venue’s capacity, layouts, accessibility and operating hours', async () => {
    await submitForReview()
    const response = await venues(safetyOfficer)
    expect(response.status).toBe(200)
    expect(response.json.venues).toEqual([expect.objectContaining({
      venueName: 'Safety Hall', attendeeCount: 80, maximumCapacity: 60, supportedLayouts: ['Theatre'],
      accessibilityFeatures: ['Wheelchair access'], operatingHours: 'Daily 08:00-22:00', requirements: 'Theatre layout',
      capacityWarning: expect.stringMatching(/exceeds venue capacity/),
    })])
    // The assigned Coordinator may read them; an Organiser may not.
    expect((await venues(coordinator)).status).toBe(200)
    expect((await venues(organiserA1)).status).toBe(403)
  })

  it('AC3: the Safety Officer cannot edit event details or change the status', async () => {
    await submitForReview()
    const before = structuredClone(api.stored(EVENT_ID))
    expect((await view(safetyOfficer)).json.editableSections).toEqual([])
    const edit = await api.call('PATCH', `/api/requests/${EVENT_ID}`, safetyOfficer, { core: { expectedAttendees: 10 } })
    expect(edit).toMatchObject({ status: 403, json: { forbiddenFields: ['core.expectedAttendees'] } })
    expect((await act(safetyOfficer, CONFIRM)).status).toBe(403)
    expect(api.stored(EVENT_ID)).toEqual(before)
  })

  it('AC6: change history for attendance, venue/layout, access and equipment only', async () => {
    // Edited before submission: a significant change would withdraw a pending check (SPM-91 AC6).
    const edit = { core: { expectedAttendees: 90, title: 'Renamed forum' }, venue: { accessibilityNeeds: 'Step-free entrance' }, internal: { planningNotes: 'Secret' } }
    expect((await api.call('PATCH', `/api/requests/${EVENT_ID}`, coordinator, edit)).status).toBe(200)
    await submitForReview()
    const response = await history(safetyOfficer)
    expect(response.status).toBe(200)
    const fields = response.json.entries.map((entry) => entry.field)
    // Attendance and access, but not the title or the internal notes.
    expect(fields.sort()).toEqual(['core.expectedAttendees', 'venue.accessibilityNeeds'])
    expect(JSON.stringify(response.json)).not.toMatch(/Secret|Renamed|seed-coordinator"/)
  })
})

describe('SPM-92 — the Safety Officer records the review', () => {
  it('AC1: only a Safety Officer may record it; others are refused and nothing is written', async () => {
    await submitForReview()
    const before = structuredClone(api.stored(EVENT_ID))
    expect((await review(coordinator, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status).toBe(403)
    for (const account of [organiserA1, venueStaff, attendee]) {
      expect((await review(account, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status, account.uid).toBe(403)
    }
    expect((await review(coordinator2, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status).toBe(404)
    expect(api.stored(EVENT_ID)).toEqual(before)
    expect(api.allNotifications()).toEqual([])
  })

  it('AC1: an event outside the queue cannot be reviewed', async () => {
    await approveArrangements()
    expect((await review(safetyOfficer, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status).toBe(403)
    expect(api.stored(EVENT_ID).safetyReviews).toBeUndefined()
  })

  it('AC2, AC3: an incomplete checklist or missing comments are refused with field errors and no write', async () => {
    await submitForReview()
    const before = structuredClone(api.stored(EVENT_ID))
    const incomplete = await review(safetyOfficer, { outcome: APPROVE_SAFETY, checklist: { layout: { result: CHECK_SATISFACTORY } } })
    expect(incomplete.status).toBe(400)
    expect(Object.keys(incomplete.json.errors)).toContain('checklist.attendanceCapacity')
    const noComments = await review(safetyOfficer, { outcome: REJECT_SAFETY_ARRANGEMENT, checklist: ALL_SATISFACTORY })
    expect(noComments).toMatchObject({ status: 400, json: { errors: { comments: expect.any(String) } } })
    expect(api.stored(EVENT_ID)).toEqual(before)
  })

  it('AC4, AC8: approval is recorded in full, notifies the Coordinator and enables Confirm', async () => {
    await submitForReview()
    const checklist = { ...ALL_SATISFACTORY, emergencyAccess: { result: CHECK_CONCERN, comment: 'Keep exit B clear' } }
    const response = await review(safetyOfficer, { outcome: APPROVE_SAFETY, checklist, comments: 'Approved', internalNotes: 'Checked on site' })
    expect(response).toMatchObject({ status: 200, json: { recorded: true, outcome: APPROVE_SAFETY, safetyReviewStatus: SAFETY_APPROVED } })

    const stored = api.stored(EVENT_ID)
    expect(stored.status).toBe(PLANNING)
    expect(stored.safetyReviews).toEqual([expect.objectContaining({
      reviewerUid: safetyOfficer.uid, reviewerName: safetyOfficer.name, reviewedAt: expect.any(String), outcome: APPROVE_SAFETY,
      checklist: expect.objectContaining({ emergencyAccess: { result: CHECK_CONCERN, comment: 'Keep exit B clear' } }),
      comments: 'Approved', internalNotes: 'Checked on site',
    })])
    expect(api.activity(EVENT_ID)).toContainEqual(expect.objectContaining({ type: SAFETY_REVIEW_DECIDED, outcome: APPROVE_SAFETY }))
    const [notice] = await api.notificationsOf(coordinator)
    expect(notice).toMatchObject({ type: SAFETY_APPROVED_NOTICE, eventRequestId: EVENT_ID })

    // The event has left the queue, and so the Safety Officer's scope.
    expect(await listIds(safetyOfficer)).toEqual([])
    expect((await view(safetyOfficer)).status).toBe(403)

    expect((await view(coordinator)).json.availableActions).toContain(CONFIRM)
    const confirmed = await act(coordinator, CONFIRM)
    expect(confirmed.json.request.status).toBe(CONFIRMED)
    expect((await api.notificationsOf(organiserA1)).map((entry) => entry.type)).toContain(REQUEST_CONFIRMED_NOTICE)
  })

  it('AC5, AC7: request changes keeps Planning and the sign-offs; the Organiser sees the comments but not internal notes', async () => {
    await submitForReview()
    const approvalsBefore = structuredClone(api.stored(EVENT_ID).arrangementApprovals)
    await review(safetyOfficer, { outcome: REQUEST_SAFETY_CHANGES, checklist: ALL_SATISFACTORY, comments: 'Add two stewards at exit B', internalNotes: 'Organiser seemed unsure' })

    expect(api.stored(EVENT_ID)).toMatchObject({ status: PLANNING, arrangementApprovals: approvalsBefore })
    const [notice] = await api.notificationsOf(coordinator)
    expect(notice).toMatchObject({ type: SAFETY_CHANGES_REQUESTED_NOTICE, reason: 'Add two stewards at exit B' })

    const organiserView = await view(organiserA1)
    expect(organiserView.json.safetyReview).toEqual({ status: SAFETY_CHANGES_REQUESTED, outcome: REQUEST_SAFETY_CHANGES, comments: 'Add two stewards at exit B', reviewedAt: expect.any(String) })
    expect(JSON.stringify(organiserView.json)).not.toMatch(/Organiser seemed unsure|Seed Safety Officer/)
    expect((await view(coordinator)).json.safetyReview.reviews[0].internalNotes).toBe('Organiser seemed unsure')
  })

  it('AC6: rejection rejects the safety arrangement, not the event; the Coordinator receives the reason', async () => {
    await submitForReview()
    await review(safetyOfficer, { outcome: REJECT_SAFETY_ARRANGEMENT, checklist: ALL_SATISFACTORY, comments: 'Hall cannot be evacuated safely at this attendance' })

    expect(api.stored(EVENT_ID)).toMatchObject({ status: PLANNING, safetyReview: { status: SAFETY_REJECTED } })
    const [notice] = await api.notificationsOf(coordinator)
    expect(notice).toMatchObject({ type: SAFETY_REJECTED_NOTICE, reason: 'Hall cannot be evacuated safely at this attendance' })
    expect(notice.message).toMatch(/venue arrangement/)
    // The whole event can still be rejected through the normal process; the same arrangement cannot be resubmitted.
    expect((await view(coordinator)).json.availableActions).toEqual(['reject'])
    expect((await act(coordinator, SUBMIT_SAFETY_REVIEW)).json.reason).toBe('safety_arrangement_not_revised')

    // Revising the venue arrangement (a significant change, which also clears the technical sign-off) allows
    // another review once the arrangements are approved again.
    expect((await api.call('PATCH', `/api/requests/${EVENT_ID}`, coordinator, { venue: { layoutPreference: 'classroom' } })).status).toBe(200)
    expect((await act(technicalStaff, APPROVE_TECHNICAL)).status).toBe(200)
    expect((await act(coordinator, SUBMIT_SAFETY_REVIEW)).status).toBe(200)
  })

  it('a cancelled event no longer shows its pending check, and leaves the queue', async () => {
    await submitForReview()
    expect((await act(coordinator, 'reject', 'Withdrawn')).status).toBe(200)
    expect((await view(organiserA1)).json.safetyReview).toBeNull()
    expect((await api.list(coordinator)).find((request) => request.id === EVENT_ID).safetyReviewStatus).toBeNull()
    expect(await listIds(safetyOfficer)).toEqual([])
  })

  it('[Team decision pending] a Confirmed event from before SPM-91 is reviewed, then can start preparation', async () => {
    api.setSafetyApproval(false)
    expect((await api.act(SEED_ACCOUNTS.coordinator3, 'start_preparation')).json.reason).toBe(SAFETY_APPROVAL_REQUIRED)
    api.putDocument('venueBookingRequests', 'legacy-booking', { eventRequestId: 'seed-req-a1-confirmed', status: 'approved' })
    expect((await api.act(SEED_ACCOUNTS.coordinator3, SUBMIT_SAFETY_REVIEW)).status).toBe(200)
    expect(api.stored().status).toBe(CONFIRMED)
    expect(await listIds(safetyOfficer)).toContain('seed-req-a1-confirmed')
    expect((await api.call('POST', '/api/requests/seed-req-a1-confirmed/safety-review', safetyOfficer, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status).toBe(200)
    expect((await api.act(SEED_ACCOUNTS.coordinator3, 'start_preparation')).status).toBe(200)
  })

  it('a review that lost a race with another is refused: the event is no longer in the queue', async () => {
    await submitForReview()
    expect((await review(safetyOfficer, { outcome: APPROVE_SAFETY, checklist: ALL_SATISFACTORY })).status).toBe(200)
    expect((await review(safetyOfficer, { outcome: REJECT_SAFETY_ARRANGEMENT, checklist: ALL_SATISFACTORY, comments: 'Late' })).status).toBe(403)
    expect(api.stored(EVENT_ID).safetyReviews).toHaveLength(1)
  })
})
