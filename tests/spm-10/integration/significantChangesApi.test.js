// SPM-10 API suite — real HTTP against the real Express app: authenticate, authorise, validatePreparation,
// validateSignificantFields and the AC7 check on PATCH /api/requests/:id; the SPM-9 transitions route; and
// GET /api/notifications. Mocked: Firebase token verification (a test token names the uid) and persistence
// (backend/src/testing/fakeFirestore.js, holding the seeded requests and profiles, with the E2E double's
// store over it). Not database verification: fakeFirestore does not model Firestore's transaction retries.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { NOTIFICATIONS_COLLECTION, SIGNIFICANT_CHANGE_NOTICE } from '../../../shared/notifications.js'
import { ARRANGEMENTS_NOT_APPROVED, SAFETY_APPROVAL_REQUIRED } from '../../../shared/statusTransitions.js'
import { CHECK_SATISFACTORY, INVALIDATED_BY_SIGNIFICANT_CHANGE, SAFETY_APPROVED, SAFETY_CHECKLIST_IDS, SAFETY_INVALIDATED, SUBMIT_SAFETY_REVIEW } from '../../../shared/safetyReview.js'
import { CANCELLATION_REQUEST_OPEN, SIGNIFICANT_CHANGE } from '../../../shared/significantChanges.js'
import { COMPLETED, CONFIRMED, PLANNING, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { addApprovedVenue } from '../../spm-90/approvedVenueFixture.js'

const TOKEN_PREFIX = 'test-token:'
const { attendee, coordinator, coordinator3, organiserA1, safetyOfficer, technicalStaff, venueStaff, venueTechnicalStaff } = SEED_ACCOUNTS

const SUBMITTED_ID = 'seed-req-a1-submitted'
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'
const RETURNED_ID = 'seed-req-a1-returned'
const PLANNING_ID = 'seed-req-a1-planning'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const COMPLETED_ID = 'seed-req-a1-completed'
const DRAFT_ID = 'seed-req-a1-draft-summit'
const NO_STAFF_ID = 'test-req-planning-no-staff'
const MIXED_STAFF_ID = 'test-req-planning-mixed-assignment'

const seeded = Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request]))
const approvals = {
  venue: { decision: 'approved', byUid: venueStaff.uid, at: '2026-09-06T12:00:00+08:00' },
  technical: { decision: 'approved', byUid: technicalStaff.uid, at: '2026-09-06T12:30:00+08:00' },
}

let db
let server
let baseUrl

beforeAll(async () => {
  const authenticate = createAuthenticate({
    async verifyIdToken(token) {
      if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
      return { uid: token.slice(TOKEN_PREFIX.length) }
    },
    async loadProfile(uid) {
      return db.collectionData('users').get(uid) ?? null
    },
  })
  const store = createFakeFirestoreEventRequestStore(() => db)
  const app = createApp({ authenticate, eventRequestStore: store, getEventRequestDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  db = createFakeFirestore({
    eventRequests: {
      ...seeded,
      [NO_STAFF_ID]: { ...structuredClone(seeded[PLANNING_ID]), assignedStaffUids: [], arrangementApprovals: approvals },
      // An attendee uid in assignedStaffUids is not staff, so is not notified.
      [MIXED_STAFF_ID]: { ...structuredClone(seeded[PLANNING_ID]), assignedStaffUids: [venueStaff.uid, attendee.uid] },
    },
    users: Object.fromEntries(Object.values(SEED_ACCOUNTS).map(({ uid, ...profile }) => [uid, profile])),
  })
})

async function call(method, path, account, body) {
  const headers = {}
  if (account) headers.Authorization = `Bearer ${TOKEN_PREFIX}${account.uid}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, text, json: text ? JSON.parse(text) : null }
}

const patch = (account, id, body) => call('PATCH', `/api/requests/${id}`, account, body)
const act = (account, id, action, reason) => call('POST', `/api/event-requests/${id}/transitions`, account, { action, ...(reason ? { reason } : {}) })
const record = (id) => db.store.get(id)
const activity = (id) => [...db.collectionData(`eventRequests/${id}/activity`).values()]
const fieldEntries = (id) => activity(id).filter((entry) => entry.type === FIELD_CHANGED)
const statusEntries = (id) => activity(id).filter((entry) => entry.type === STATUS_CHANGED)
const notifications = () => [...db.collectionData(NOTIFICATIONS_COLLECTION).values()]
const significantNotices = () => notifications().filter((notice) => notice.type === SIGNIFICANT_CHANGE_NOTICE)
const snapshot = (id) => structuredClone({ record: record(id), activity: activity(id), notifications: notifications() })

async function approveBoth(id) {
  record(id).arrangementApprovals = { ...record(id).arrangementApprovals, venue: { decision: 'approved', byUid: venueStaff.uid, at: 'legacy' } }
  db.collectionData('venueBookingRequests').set(`approved-${id}`, { eventRequestId: id, status: 'approved' })
  expect((await act(technicalStaff, id, 'approve_technical')).status).toBe(200)
}

describe('SPM-10 AC1 — ordinary edits are applied with no other effect', () => {
  it.each([
    ['Submitted', SUBMITTED_ID, coordinator, SUBMITTED],
    ['Under Review', UNDER_REVIEW_ID, coordinator, UNDER_REVIEW],
    ['Planning (sign-offs approved)', PLANNING_ID, coordinator, PLANNING],
    ['Confirmed', CONFIRMED_ID, coordinator3, CONFIRMED],
  ])('%s: status and sign-offs unchanged, nothing marked significant, nobody notified', async (_label, id, account, status) => {
    if (id === PLANNING_ID) await approveBoth(id)
    const approvalsBefore = structuredClone(record(id).arrangementApprovals)
    const before = notifications().length

    const response = await patch(account, id, { core: { title: 'Renamed', description: 'New text' }, registration: { notes: 'Doors 9am' }, internal: { planningNotes: 'Hall B' } })
    expect(response.status).toBe(200)
    expect(record(id).status).toBe(status)
    expect(record(id).arrangementApprovals).toEqual(approvalsBefore)
    expect(record(id).core.title).toBe('Renamed')
    expect(fieldEntries(id).map((entry) => entry.field).sort()).toEqual(['core.description', 'core.title', 'internal.planningNotes', 'registration.notes'])
    expect(fieldEntries(id).some((entry) => entry.significant)).toBe(false)
    expect(statusEntries(id).filter((entry) => entry.action === SIGNIFICANT_CHANGE)).toEqual([])
    expect(notifications()).toHaveLength(before)
  })
})

describe('SPM-10 AC2 — Submitted or Under Review: marked significant, no other effect', () => {
  it.each([['Submitted', SUBMITTED_ID, SUBMITTED], ['Under Review', UNDER_REVIEW_ID, UNDER_REVIEW]])('%s', async (_label, id, status) => {
    const response = await patch(coordinator, id, { core: { expectedAttendees: 150 } })
    expect(response.status).toBe(200)
    expect(record(id).status).toBe(status)
    expect(fieldEntries(id)).toEqual([expect.objectContaining({ field: 'core.expectedAttendees', oldValue: 80, newValue: 150, significant: true })])
    expect(statusEntries(id)).toEqual([])
    expect(notifications()).toEqual([])
  })
})

// SPM-87 supersedes SPM-10's automatic reset (CL3 G8!C51): the sign-offs are kept and marked "Changed since
// approval", and the Coordinator decides which go back (tests/spm-87).
describe('SPM-10 AC3 / SPM-87 AC1 — Planning: significant edit marks the recorded sign-offs', () => {
  it('both sign-offs are kept and marked Changed since approval; the status stays Planning', async () => {
    await approveBoth(PLANNING_ID)
    const response = await patch(coordinator, PLANNING_ID, { venue: { layoutPreference: 'banquet' } })
    expect(response.status).toBe(200)
    expect(record(PLANNING_ID).status).toBe(PLANNING)
    expect(record(PLANNING_ID).arrangementApprovals.technical).toMatchObject({ decision: 'approved' })
    expect(record(PLANNING_ID).signOffReview).toMatchObject({ status: 'pending', changedFields: ['venue.layoutPreference'] })
    expect(record(PLANNING_ID).signOffReview.items.map((item) => item.key).sort()).toEqual(['technical', `venue:approved-${PLANNING_ID}`])
    expect(response.json.arrangements).toEqual({
      venue: { required: true, decision: 'approved', at: null },
      technical: { required: true, decision: 'approved', at: expect.any(String) },
    })
    expect(response.json.signOffReview.items).toHaveLength(2)
    expect(fieldEntries(PLANNING_ID)).toEqual([expect.objectContaining({ field: 'venue.layoutPreference', significant: true })])
    expect(statusEntries(PLANNING_ID).filter((entry) => entry.action === SIGNIFICANT_CHANGE)).toEqual([])
  })

  it('a rejected decision is not a sign-off to mark, and stays as recorded', async () => {
    record(PLANNING_ID).arrangementApprovals = { technical: { decision: 'rejected', byUid: venueStaff.uid, at: 'legacy' } }
    await patch(coordinator, PLANNING_ID, { core: { durationHours: 6 } })
    expect(record(PLANNING_ID).arrangementApprovals).toEqual({ technical: { decision: 'rejected', byUid: venueStaff.uid, at: 'legacy' } })
    expect(record(PLANNING_ID).signOffReview).toBeUndefined()
  })

  it('"Not required" is derived: removing all equipment makes technical sign-off not required', async () => {
    await approveBoth(PLANNING_ID)
    const response = await patch(coordinator, PLANNING_ID, { equipment: { requirements: [], technicalSupportNeeded: false } })
    expect(response.status).toBe(200)
    expect(response.json.arrangements.technical).toMatchObject({ required: false })
    expect(response.json.arrangements.venue).toEqual({ required: true, decision: 'approved', at: null })
  })
})

describe('SPM-10 AC4/AC5, SPM-87 AC3 — Confirmed: back to Planning, sign-offs marked, Confirm refused until decided and re-approved', () => {
  it('the status moves to Planning with a status_changed entry carrying the Coordinator, time and reason', async () => {
    const start = Date.now()
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 } })
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(PLANNING)
    expect(record(CONFIRMED_ID).status).toBe(PLANNING)
    expect(record(CONFIRMED_ID).arrangementApprovals.technical).toMatchObject({ decision: 'approved' })
    expect(record(CONFIRMED_ID).signOffReview).toMatchObject({ status: 'pending', items: [expect.objectContaining({ key: 'technical' })] })
    expect(record(CONFIRMED_ID).core.expectedAttendees).toBe(120)
    expect(fieldEntries(CONFIRMED_ID)).toEqual([expect.objectContaining({ field: 'core.expectedAttendees', oldValue: 80, newValue: 120, significant: true })])

    const [entry] = statusEntries(CONFIRMED_ID)
    expect(statusEntries(CONFIRMED_ID)).toHaveLength(1)
    expect(entry).toEqual({
      type: STATUS_CHANGED,
      action: SIGNIFICANT_CHANGE,
      fromStatus: CONFIRMED,
      toStatus: PLANNING,
      fields: ['core.expectedAttendees'],
      actor: { type: 'user', uid: coordinator3.uid, name: coordinator3.name },
      at: expect.any(String),
      reason: SIGNIFICANT_CHANGE,
    })
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(start - 1000)
    // Not an action anyone can take.
    expect(response.json.availableActions).not.toContain(SIGNIFICANT_CHANGE)
  })

  // SPM-91 AC6: "When an accepted significant change returns a safety-approved event to Planning, its safety
  // approval is invalidated and another safety check is required."
  it('Confirm is refused until the Coordinator decides, the sent-back sign-off and a new safety check are approved', async () => {
    expect(record(CONFIRMED_ID).safetyReview.status).toBe(SAFETY_APPROVED)
    await patch(coordinator3, CONFIRMED_ID, { core: { preferredDateTime: '2026-11-27T09:00:00+08:00' } })
    expect(record(CONFIRMED_ID).safetyReview).toMatchObject({ status: SAFETY_INVALIDATED, invalidatedReason: INVALIDATED_BY_SIGNIFICANT_CHANGE })
    expect((await act(coordinator3, CONFIRMED_ID, 'confirm')).json.reason).toBe(ARRANGEMENTS_NOT_APPROVED)
    addApprovedVenue(db, CONFIRMED_ID, `approved-${CONFIRMED_ID}`)
    expect((await act(coordinator3, CONFIRMED_ID, 'confirm')).json.reason).toBe('sign_off_review_pending')
    expect((await act(coordinator3, CONFIRMED_ID, SUBMIT_SAFETY_REVIEW)).json.reason).toBe('sign_off_review_pending')
    // SPM-87: the Coordinator sends the technical sign-off back; it is approved again.
    expect((await call('POST', `/api/requests/${CONFIRMED_ID}/sign-off-review`, coordinator3, { reapprove: ['technical'] })).status).toBe(200)
    expect((await act(coordinator3, CONFIRMED_ID, 'confirm')).json.reason).toBe(ARRANGEMENTS_NOT_APPROVED)
    expect((await act(technicalStaff, CONFIRMED_ID, 'approve_technical')).status).toBe(200)
    expect((await act(coordinator3, CONFIRMED_ID, 'confirm')).json.reason).toBe(SAFETY_APPROVAL_REQUIRED)
    expect((await act(coordinator3, CONFIRMED_ID, SUBMIT_SAFETY_REVIEW)).status).toBe(200)
    const checklist = Object.fromEntries(SAFETY_CHECKLIST_IDS.map((id) => [id, { result: CHECK_SATISFACTORY }]))
    expect((await call('POST', `/api/requests/${CONFIRMED_ID}/safety-review`, safetyOfficer, { outcome: 'approve', checklist })).status).toBe(200)
    const confirmed = await act(coordinator3, CONFIRMED_ID, 'confirm')
    expect(confirmed.status).toBe(200)
    expect(confirmed.json.request.status).toBe(CONFIRMED)
  })

  it('a mixed save: the ordinary field is applied unmarked, the significant one marked, and the effects apply once', async () => {
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { title: 'Summit (moved)', durationHours: 5 }, equipment: { requirements: ['projector'] } })
    expect(response.status).toBe(200)
    const entries = Object.fromEntries(fieldEntries(CONFIRMED_ID).map((entry) => [entry.field, entry]))
    expect(Object.keys(entries).sort()).toEqual(['core.durationHours', 'core.title', 'equipment.requirements'])
    expect(entries['core.title']).not.toHaveProperty('significant')
    expect(entries['core.durationHours'].significant).toBe(true)
    expect(entries['equipment.requirements'].significant).toBe(true)
    expect(statusEntries(CONFIRMED_ID)).toEqual([expect.objectContaining({ fields: ['core.durationHours', 'equipment.requirements'] })])
  })
})

describe('SPM-10 AC6 — validation of significant fields', () => {
  it.each([
    ['attendance not a whole number', { core: { expectedAttendees: 12.5 } }, 'core.expectedAttendees'],
    ['attendance not positive', { core: { expectedAttendees: 0 } }, 'core.expectedAttendees'],
    ['attendance not a number', { core: { expectedAttendees: 'eighty' } }, 'core.expectedAttendees'],
    ['an invalid date', { core: { preferredDateTime: 'next Tuesday-ish' } }, 'core.preferredDateTime'],
    ['a duration that is not positive', { core: { durationHours: -1 } }, 'core.durationHours'],
    ['a layout that is too long', { venue: { layoutPreference: 'x'.repeat(2001) } }, 'venue.layoutPreference'],
    ['a layout that is not text', { venue: { layoutPreference: 7 } }, 'venue.layoutPreference'],
    ['an equipment list that is not an array', { equipment: { requirements: 'projector' } }, 'equipment.requirements'],
    ['an equipment list with a non-text item', { equipment: { requirements: ['projector', 3] } }, 'equipment.requirements'],
    ['a technical support flag that is not a boolean', { equipment: { technicalSupportNeeded: 'yes' } }, 'equipment.technicalSupportNeeded'],
    ['an accessibility flag that is not a boolean', { venue: { accessibilityRequired: 1 } }, 'venue.accessibilityRequired'],
  ])('%s: 400 explaining the problem, nothing written', async (_label, body, field) => {
    const before = snapshot(CONFIRMED_ID)
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { title: 'Also changed' }, ...body, ...(body.core ? { core: { title: 'Also changed', ...body.core } } : {}) })
    expect(response.status).toBe(400)
    expect(Object.keys(response.json.errors)).toEqual([field])
    expect(response.json.errors[field]).toEqual(expect.any(String))
    expect(snapshot(CONFIRMED_ID)).toEqual(before)
  })

  it('a value equal to the current one in another format is not a change', async () => {
    const before = snapshot(CONFIRMED_ID)
    const response = await patch(coordinator3, CONFIRMED_ID, {
      core: { expectedAttendees: '80', durationHours: '4', preferredDateTime: '2026-11-20T01:00:00.000Z' },
      equipment: { requirements: [' projector ', 'wireless microphone', ''] },
    })
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(CONFIRMED)
    expect(fieldEntries(CONFIRMED_ID)).toEqual([])
    expect(record(CONFIRMED_ID).arrangementApprovals).toEqual(before.record.arrangementApprovals)
    expect(record(CONFIRMED_ID).core).toEqual(before.record.core)
    expect(notifications()).toEqual([])
  })

  it('the normalised value is stored', async () => {
    await patch(coordinator, SUBMITTED_ID, { core: { expectedAttendees: '150', preferredDateTime: '2026-12-01T10:00:00+08:00' } })
    expect(record(SUBMITTED_ID).core.expectedAttendees).toBe(150)
    expect(record(SUBMITTED_ID).core.preferredDateTime).toBe('2026-12-01T02:00:00.000Z')
  })

  it.each([
    ['Submitted', SUBMITTED_ID, coordinator],
    ['Returned (the Organiser)', RETURNED_ID, organiserA1],
  ])('%s: a required significant field cannot be cleared — 400 "Required"', async (_label, id, account) => {
    for (const body of [
      { core: { expectedAttendees: null } },
      { core: { durationHours: '' } },
      { core: { preferredDateTime: '' } },
      { venue: { layoutPreference: '   ' } },
    ]) {
      const before = snapshot(id)
      const response = await patch(account, id, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(Object.values(response.json.errors)).toEqual(['Required.'])
      expect(snapshot(id)).toEqual(before)
    }
  })

  it('optional significant fields can be cleared after submission', async () => {
    await patch(coordinator, SUBMITTED_ID, { venue: { accessibilityNeeds: 'Ramp' } })
    const response = await patch(coordinator, SUBMITTED_ID, { venue: { accessibilityNeeds: '' }, equipment: { requirements: [] } })
    expect(response.status).toBe(200)
    expect(record(SUBMITTED_ID).venue.accessibilityNeeds).toBeNull()
    expect(record(SUBMITTED_ID).equipment.requirements).toEqual([])
  })

  it('Draft (SPM-4 route): a draft may still clear a required field', async () => {
    const draft = record(DRAFT_ID)
    expect(draft.core.expectedAttendees).toBe(240)
    const response = await call('PATCH', `/api/event-requests/${DRAFT_ID}`, organiserA1, {
      core: { ...draft.core, expectedAttendees: '' },
      venue: draft.venue,
      equipment: draft.equipment,
      registration: draft.registration,
    })
    expect(response.status).toBe(200)
    expect(record(DRAFT_ID).core.expectedAttendees).toBeNull()
  })

  it('Draft (PATCH /api/requests, the owner): a draft may clear a required field, and keeps the draft format rules', async () => {
    const cleared = await patch(organiserA1, DRAFT_ID, { core: { expectedAttendees: null, preferredDateTime: '' } })
    expect(cleared.status).toBe(200)
    expect(record(DRAFT_ID).core.expectedAttendees).toBeNull()
    expect(record(DRAFT_ID).core.preferredDateTime).toBeNull()
    expect(fieldEntries(DRAFT_ID), 'drafts record no history (SPM-28)').toEqual([])

    const invalid = await patch(organiserA1, DRAFT_ID, { core: { expectedAttendees: -3 } })
    expect(invalid.status).toBe(400)
  })
})

describe('SPM-10 AC7 — an open cancellation request blocks a significant change on a Confirmed event', () => {
  beforeEach(async () => {
    expect((await act(organiserA1, CONFIRMED_ID, 'request_cancellation', 'Budget cut')).status).toBe(200)
  })

  it('a significant change is refused with 409 and a message; nothing is written', async () => {
    const before = snapshot(CONFIRMED_ID)
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { title: 'Ignored too', expectedAttendees: 120 } })
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(CANCELLATION_REQUEST_OPEN)
    expect(response.json.message).toMatch(/open cancellation request/)
    expect(response.json.significantFields).toEqual(['core.expectedAttendees'])
    expect(snapshot(CONFIRMED_ID)).toEqual(before)
  })

  it('ordinary edits are still allowed, and the event stays Confirmed', async () => {
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { title: 'Summit (renamed)' } })
    expect(response.status).toBe(200)
    expect(record(CONFIRMED_ID).status).toBe(CONFIRMED)
    expect(record(CONFIRMED_ID).cancellationRequest.status).toBe('pending')
  })

  it('a returned (still open) request blocks it too; once refused, the change is allowed', async () => {
    expect((await act(coordinator3, CONFIRMED_ID, 'return_cancellation', 'Which date?')).status).toBe(200)
    expect((await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 } })).status).toBe(409)
    expect((await act(coordinator3, CONFIRMED_ID, 'refuse_cancellation', 'Going ahead')).status).toBe(200)
    expect((await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 } })).status).toBe(200)
    expect(record(CONFIRMED_ID).status).toBe(PLANNING)
  })

  it('a value equal to the current one is not a change, so it is not blocked', async () => {
    expect((await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: '80' } })).status).toBe(200)
  })
})

describe('SPM-10 AC8 — notifications to assigned Venue and Technical Support Staff', () => {
  it('Confirmed: each assigned staff member is notified once, in-app, with the title, fields and new status', async () => {
    await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 }, venue: { layoutPreference: 'cabaret' } })
    const notices = significantNotices()
    expect(notices.map((notice) => notice.recipientUid).sort()).toEqual([technicalStaff.uid, venueStaff.uid, venueTechnicalStaff.uid].sort())
    for (const notice of notices) {
      expect(notice).toMatchObject({
        type: SIGNIFICANT_CHANGE_NOTICE,
        eventRequestId: CONFIRMED_ID,
        eventTitle: seeded[CONFIRMED_ID].core.title,
        changedFields: ['Expected attendees', 'Layout preference'],
        status: PLANNING,
        readAt: null,
      })
      expect(notice.message).toMatch(/moved back to Planning/)
    }
    const venueInbox = await call('GET', '/api/notifications', venueStaff)
    expect(venueInbox.json.notifications).toEqual([expect.objectContaining({ type: SIGNIFICANT_CHANGE_NOTICE, eventRequestId: CONFIRMED_ID })])
    expect((await call('GET', '/api/notifications', coordinator3)).json.notifications).toEqual([])
    expect((await call('GET', '/api/notifications', organiserA1)).json.notifications).toEqual([])
  })

  it('Planning: the message says it remains in Planning', async () => {
    await patch(coordinator, PLANNING_ID, { core: { durationHours: 6 } })
    expect(significantNotices()).toHaveLength(3)
    expect(significantNotices()[0].message).toMatch(/remains in Planning/)
  })

  it('only users holding a staff role are notified', async () => {
    await patch(coordinator, MIXED_STAFF_ID, { core: { durationHours: 6 } })
    expect(significantNotices().map((notice) => notice.recipientUid)).toEqual([venueStaff.uid])
  })

  it('no staff assigned: the change is saved and nothing is sent', async () => {
    const response = await patch(coordinator, NO_STAFF_ID, { core: { durationHours: 6 } })
    expect(response.status).toBe(200)
    expect(record(NO_STAFF_ID).arrangementApprovals).toEqual(approvals)
    expect(notifications()).toEqual([])
  })

  it('Submitted / Under Review and ordinary edits notify no one', async () => {
    await patch(coordinator, UNDER_REVIEW_ID, { core: { expectedAttendees: 99 } })
    await patch(coordinator3, CONFIRMED_ID, { core: { title: 'Renamed' } })
    expect(notifications()).toEqual([])
  })
})

describe('SPM-10 — one transaction', () => {
  it('the fields, history, status entry, metadata and notifications are written in one committed transaction', async () => {
    const committedBefore = db.transactions.filter((tx) => tx.committed).length
    await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 } })
    const committed = db.transactions.filter((tx) => tx.committed)
    expect(committed).toHaveLength(committedBefore + 1)
    const { writes } = committed.at(-1)
    expect(writes).toContain(`eventRequests/${CONFIRMED_ID}`)
    expect(writes.filter((path) => path.startsWith(`eventRequests/${CONFIRMED_ID}/activity/`))).toHaveLength(2)
    expect(writes.filter((path) => path.startsWith(`${NOTIFICATIONS_COLLECTION}/`))).toHaveLength(3)
  })

  it('a failed commit writes nothing at all', async () => {
    const before = snapshot(CONFIRMED_ID)
    const original = db.runTransaction.bind(db)
    db.runTransaction = (callback) =>
      original(async (tx) => {
        await callback(tx)
        throw new Error('simulated commit failure')
      })
    const response = await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 } })
    expect(response.status).toBe(500)
    expect(snapshot(CONFIRMED_ID)).toEqual(before)
  })
})

describe('SPM-10 AC10/AC11 — still read-only where it was', () => {
  it('Completed, Cancelled and Rejected: every event field is refused with 403', async () => {
    for (const [id, account] of [[COMPLETED_ID, coordinator], ['seed-req-a1-cancelled', SEED_ACCOUNTS.coordinator2], ['seed-req-a1-rejected', coordinator]]) {
      const response = await patch(account, id, { core: { expectedAttendees: 10, title: 'x' } })
      expect(response.status, id).toBe(403)
    }
    expect(record(COMPLETED_ID).status).toBe(COMPLETED)
  })

  it.each([
    ['Venue Staff', venueStaff],
    ['Technical Support Staff', technicalStaff],
    ['Venue + Technical Staff', venueTechnicalStaff],
    ['Attendee', attendee],
  ])('%s cannot edit main event details (403, not 400)', async (_label, account) => {
    const response = await patch(account, CONFIRMED_ID, { core: { expectedAttendees: 'not even valid' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['core.expectedAttendees'])
  })
})

describe('SPM-10 — change history marks significant entries for both viewers', () => {
  it('the Coordinator and the owning Organiser see "significant"; the Organiser still never sees internal', async () => {
    await patch(coordinator3, CONFIRMED_ID, { core: { expectedAttendees: 120 }, internal: { planningNotes: 'Bigger room' } })
    const coordinatorView = await call('GET', `/api/requests/${CONFIRMED_ID}/history`, coordinator3)
    expect(coordinatorView.json.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'core.expectedAttendees', significant: true }),
      expect.objectContaining({ field: 'internal.planningNotes' }),
    ]))
    expect(coordinatorView.json.entries.find((entry) => entry.field === 'internal.planningNotes')).not.toHaveProperty('significant')

    const organiserView = await call('GET', `/api/requests/${CONFIRMED_ID}/history`, organiserA1)
    expect(organiserView.json.entries).toEqual([expect.objectContaining({ field: 'core.expectedAttendees', significant: true })])
  })
})
