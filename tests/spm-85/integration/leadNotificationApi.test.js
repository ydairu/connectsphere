// SPM-85 through the API: a first submission that enters the unassigned queue notifies every Event Coordinator Lead
// once, in the submit transaction; a resubmitted Returned request notifies no Lead. In-memory harness
// (tests/shared/helpers/cancellationApi.js: real HTTP and middleware, mocked token verification, fakeFirestore) —
// not database verification.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { submitDraftEventRequest } from '../../../backend/src/services/eventRequestService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { NEW_UNASSIGNED_REQUEST_NOTICE, NOTIFICATIONS_COLLECTION } from '../../../shared/notifications.js'
import { COORDINATOR_LEAD, ORGANISER } from '../../../shared/permissions.js'
import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import { RESUBMIT, RETURN_FOR_CLARIFICATION } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const api = createCancellationApi()
beforeAll(api.start)
afterAll(api.stop)
beforeEach(api.reset)

const { coordinator, coordinatorLead, organiserA1, organiserA3 } = SEED_ACCOUNTS
const SECOND_LEAD = { uid: 'spm85-second-lead', name: 'Second Lead', email: 'lead-2@spm85.test', roles: [COORDINATOR_LEAD] }
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'
const START = '2027-02-12T18:30:00+08:00'

const addUser = ({ uid, ...profile }) => api.putDocument('users', uid, profile)
const leadNotices = async (account) => (await api.notificationsOf(account)).filter((notice) => notice.type === NEW_UNASSIGNED_REQUEST_NOTICE)
const allLeadNotices = () => api.allNotifications().filter((notice) => notice.type === NEW_UNASSIGNED_REQUEST_NOTICE)

async function createDraft(account, title = 'Queue demo') {
  const created = await api.call('POST', '/api/event-requests', account, {
    core: { title, purpose: 'SPM-85', expectedAttendees: 40, durationHours: 3, preferredDateTime: START },
    venue: { layoutPreference: 'theatre' },
  })
  expect(created.status).toBe(201)
  return created.json.eventRequest.id
}

async function submitNew(account = organiserA3, title) {
  const id = await createDraft(account, title)
  const submitted = await api.call('POST', `/api/event-requests/${id}/submit`, account)
  expect(submitted.status).toBe(200)
  return id
}

describe('SPM-85 AC1 — a first submission notifies the Lead with the event, organisation, date and queue', () => {
  it('spm85_every_lead_is_notified_once_with_the_event_details', async () => {
    addUser(SECOND_LEAD)
    const id = await submitNew()

    for (const lead of [coordinatorLead, SECOND_LEAD]) {
      const notices = await leadNotices(lead)
      expect(notices, lead.uid).toHaveLength(1)
      expect(notices[0]).toMatchObject({
        type: NEW_UNASSIGNED_REQUEST_NOTICE,
        eventRequestId: id,
        eventTitle: 'Queue demo',
        message: `New request “Queue demo” from ${organiserA3.organisationName} is waiting for assignment.`,
        eventStartsAt: START,
        readAt: null,
      })
    }
    expect(allLeadNotices()).toHaveLength(2)
  })

  it('spm85_nobody_else_is_notified_and_the_request_is_in_the_queue', async () => {
    const id = await submitNew()
    expect(api.allNotifications().map((notice) => notice.recipientUid)).toEqual([coordinatorLead.uid])
    for (const account of [organiserA3, coordinator, SEED_ACCOUNTS.coordinator2, SEED_ACCOUNTS.venueStaff, SEED_ACCOUNTS.attendee]) {
      expect(await api.notificationsOf(account), account.uid).toEqual([])
    }
    const queue = await api.call('GET', '/api/requests/unassigned', coordinatorLead)
    expect(queue.json.requests.map((item) => item.id)).toContain(id)
  })

  it('spm85_the_notice_is_written_in_the_submit_transaction_after_reading_the_leads', async () => {
    addUser(SECOND_LEAD)
    const id = await submitNew()

    const submits = api.transactions().filter((transaction) => transaction.writes.includes(`eventRequests/${id}`))
    expect(submits).toHaveLength(1)
    const [submit] = submits
    expect(submit.committed).toBe(true)
    expect(submit.reads).toEqual([`eventRequests/${id}`, 'users', 'users'])
    expect(submit.writes.filter((path) => path.startsWith(`eventRequests/${id}/activity/`))).toHaveLength(1)
    expect(submit.writes.filter((path) => path.startsWith(`${NOTIFICATIONS_COLLECTION}/`))).toHaveLength(2)
  })
})

describe('SPM-85 AC2 — several new requests each get their own notice', () => {
  it('spm85_two_submissions_give_two_notices_naming_each_event', async () => {
    const forum = await submitNew(organiserA3, 'Partner forum')
    const gala = await submitNew(organiserA1, 'Winter gala')

    const notices = (await leadNotices(coordinatorLead)).map(({ eventRequestId, eventTitle, message }) => ({ eventRequestId, eventTitle, message }))
    expect(notices.sort((a, b) => a.eventTitle.localeCompare(b.eventTitle))).toEqual([
      { eventRequestId: forum, eventTitle: 'Partner forum', message: `New request “Partner forum” from ${organiserA3.organisationName} is waiting for assignment.` },
      { eventRequestId: gala, eventTitle: 'Winter gala', message: `New request “Winter gala” from ${organiserA1.organisationName} is waiting for assignment.` },
    ])
  })
})

describe('SPM-85 — when no Lead is notified', () => {
  it('spm85_a_resubmitted_returned_request_goes_back_to_its_coordinator_without_a_lead_notice', async () => {
    expect((await api.act(coordinator, RETURN_FOR_CLARIFICATION, 'Please confirm the attendance.', UNDER_REVIEW_ID)).status).toBe(200)
    expect((await api.act(organiserA1, RESUBMIT, undefined, UNDER_REVIEW_ID)).status).toBe(200)

    expect(api.stored(UNDER_REVIEW_ID)).toMatchObject({ status: SUBMITTED, assignedCoordinatorUid: coordinator.uid })
    expect(allLeadNotices()).toEqual([])
    const resubmit = api.transactions().find((transaction) => transaction.committed && transaction.writes.includes(`eventRequests/${UNDER_REVIEW_ID}`) && !transaction.writes.some((path) => path.startsWith(`${NOTIFICATIONS_COLLECTION}/`)))
    expect(resubmit.reads).not.toContain('users')
  })

  it('spm85_with_no_lead_accounts_the_submission_still_succeeds', async () => {
    const { uid, ...lead } = coordinatorLead
    addUser({ uid, ...lead, roles: [] })
    const id = await submitNew()

    expect(api.stored(id)).toMatchObject({ status: SUBMITTED, assignedCoordinatorUid: null })
    expect(allLeadNotices()).toEqual([])
  })

  it('spm85_a_submitter_who_is_also_a_lead_is_not_notified_but_the_other_lead_is', async () => {
    const organiserLead = { ...organiserA3, uid: 'spm85-organiser-lead', email: 'organiser-lead@spm85.test', roles: [ORGANISER, COORDINATOR_LEAD] }
    addUser(organiserLead)
    await submitNew(organiserLead)

    expect(allLeadNotices().map((notice) => notice.recipientUid)).toEqual([coordinatorLead.uid])
  })

  it('spm85_a_submission_that_fails_validation_sends_nothing', async () => {
    const created = await api.call('POST', '/api/event-requests', organiserA3, { core: { title: 'Incomplete' } })
    expect(created.status).toBe(201)
    const id = created.json.eventRequest.id

    expect((await api.call('POST', `/api/event-requests/${id}/submit`, organiserA3)).status).toBe(400)
    expect(api.stored(id).status).toBe(DRAFT)
    expect(api.allNotifications()).toEqual([])
  })
})

describe('SPM-85 — the notice and the submission are saved together', () => {
  it('spm85_if_the_transaction_fails_after_queuing_the_notice_neither_is_saved', async () => {
    const draft = {
      status: DRAFT,
      ownerUid: organiserA3.uid,
      organisationName: organiserA3.organisationName,
      core: { title: 'Atomic', purpose: 'SPM-85', expectedAttendees: 40, durationHours: 3, preferredDateTime: START },
      venue: { layoutPreference: 'theatre' },
    }
    const db = createFakeFirestore({ eventRequests: { draft }, users: { [coordinatorLead.uid]: { roles: [COORDINATOR_LEAD] } } })
    const run = db.runTransaction.bind(db)
    // Every write is queued; the transaction then fails before it commits.
    db.runTransaction = (callback) => run(async (tx) => {
      await callback(tx)
      throw new Error('commit failed')
    })

    await expect(submitDraftEventRequest('draft', organiserA3, db)).rejects.toThrow('commit failed')
    expect(db.transactions[0].writes.some((path) => path.startsWith(`${NOTIFICATIONS_COLLECTION}/`))).toBe(true)
    expect(db.transactions[0].committed).toBe(false)
    expect(db.store.get('draft').status).toBe(DRAFT)
    expect([...db.collectionData(NOTIFICATIONS_COLLECTION).values()]).toEqual([])
  })
})
