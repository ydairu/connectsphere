// SPM-39 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP against the real
// Express app, the registration service and the shared rules. Mocked: token verification and persistence. Not
// database verification: simultaneous joins are proven on the Firestore emulator (waitingList.emulator.test.js).
//
// The seeded two-place event is set to one place, open, starting in 30 days (relative to the real clock, which the
// API reads), and `attendee` takes the place, so the event is full before each test.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { ATTENDEE_EVENT_CANCELLED_NOTICE } from '../../../shared/notifications.js'
import { ATTENDEE } from '../../../shared/permissions.js'
import { REGISTERED, WAITLISTED } from '../../../shared/registration.js'
import { CANCEL } from '../../../shared/statusTransitions.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, coordinator, attendee, attendee2 } = SEED_ACCOUNTS
const SMALL_ID = 'seed-req-a1-confirmed-small'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const api = createCancellationApi()

// Waiting-list Attendees whose ids sort in the opposite order to the order they join, so the test can tell
// first-come-first-served from alphabetical.
const waitlisters = ['wait-z', 'wait-m', 'wait-a'].map((uid, index) => ({ uid, name: `Waitlister ${index + 1}`, email: `${uid}@example.test`, roles: [ATTENDEE] }))

const iso = (offset) => new Date(Date.now() + offset).toISOString()
const register = (account, id = SMALL_ID) => api.call('POST', `/api/requests/${id}/registrations`, account)
const join = (account, id = SMALL_ID) => api.call('POST', `/api/requests/${id}/waiting-list`, account)
const summary = async (account, id = SMALL_ID) => (await api.view(account, id)).json.attendeeRegistration
const mine = async (account) => (await api.call('GET', '/api/registrations', account)).json.registrations
const listFor = (account, id = SMALL_ID) => api.call('GET', `/api/requests/${id}/registrations`, account)

function setRegistration(changes = {}) {
  const event = api.stored(SMALL_ID)
  api.updateStored(SMALL_ID, {
    core: { ...event.core, preferredDateTime: iso(30 * DAY) },
    registration: { ...event.registration, enabled: true, opensAt: iso(-DAY), closesAt: iso(29 * DAY), capacity: 1, ...changes },
  })
}

beforeAll(api.start)
afterAll(api.stop)
beforeEach(async () => {
  api.reset()
  for (const { uid, ...profile } of waitlisters) api.putDocument('users', uid, profile)
  setRegistration()
  expect((await register(attendee)).status).toBe(201)
})

describe('SPM-39 AC1 — a full event with registration open offers the waiting list', () => {
  it('spm39_the_event_page_offers_the_waiting_list_once_the_event_is_full', async () => {
    expect(await summary(attendee2)).toMatchObject({ canRegister: false, reason: 'full', canJoinWaitingList: true, waitingListPosition: null })
  })

  it('spm39_joining_puts_the_attendee_on_the_waiting_list_and_not_in_a_place', async () => {
    const joined = await join(attendee2)
    expect(joined.status).toBe(201)
    expect(joined.json.registration).toMatchObject({ eventRequestId: SMALL_ID, status: WAITLISTED, waitingListPosition: 1 })
    expect(await summary(attendee2)).toMatchObject({ canJoinWaitingList: false, waitingListPosition: 1, myRegistration: { status: WAITLISTED } })
    expect((await listFor(organiserA1)).json).toMatchObject({ registeredCount: 1, waitingListCount: 1 })
  })

  it('spm39_w4_while_a_place_is_free_joining_is_refused_and_the_attendee_registers_instead', async () => {
    setRegistration({ capacity: 2 })
    expect(await summary(attendee2)).toMatchObject({ canRegister: true, canJoinWaitingList: false })
    const refused = await join(attendee2)
    expect(refused.status).toBe(409)
    expect(refused.json).toEqual({ message: 'Places are still available. Register instead.', reason: 'not_full' })
  })
})

describe('SPM-39 AC2 — registration closed means no waiting list', () => {
  it('spm39_a_full_event_whose_registration_has_closed_cannot_be_joined', async () => {
    setRegistration({ opensAt: iso(-2 * DAY), closesAt: iso(-HOUR) })
    expect(await summary(attendee2)).toMatchObject({ canJoinWaitingList: false, reason: 'closed' })
    const refused = await join(attendee2)
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('closed')
    expect(api.documents('eventRegistrations').filter((record) => record.status === WAITLISTED)).toEqual([])
  })

  it('spm39_nor_before_registration_opens', async () => {
    setRegistration({ opensAt: iso(HOUR), closesAt: iso(2 * DAY) })
    expect((await join(attendee2)).json.reason).toBe('not_open_yet')
  })

  it('spm39_nor_when_the_organiser_has_turned_registration_off', async () => {
    setRegistration({ enabled: false })
    expect((await join(attendee2)).status).toBe(403)
  })
})

describe('SPM-39 AC3 — the waiting list is first come, first served', () => {
  it('spm39_attendees_are_queued_in_the_order_they_joined', async () => {
    for (const [index, account] of waitlisters.entries()) {
      const joined = await join(account)
      expect(joined.status, account.uid).toBe(201)
      expect(joined.json.registration.waitingListPosition, account.uid).toBe(index + 1)
    }
    for (const [index, account] of waitlisters.entries()) {
      expect(await mine(account), account.uid).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, status: WAITLISTED, waitingListPosition: index + 1 })])
      expect((await summary(account)).waitingListPosition, account.uid).toBe(index + 1)
    }
  })

  it('spm39_simultaneous_joins_get_distinct_positions_in_memory', async () => {
    const results = await Promise.all(waitlisters.map((account) => join(account)))
    expect(results.map((result) => result.status)).toEqual([201, 201, 201])
    expect(results.map((result) => result.json.registration.waitingListPosition).sort()).toEqual([1, 2, 3])
  })

  it('spm39_an_attendee_joins_once_and_not_while_registered', async () => {
    await join(attendee2)
    const again = await join(attendee2)
    expect(again.status).toBe(409)
    expect(again.json.reason).toBe('already_waitlisted')
    const registered = await join(attendee)
    expect(registered.status).toBe(409)
    expect(registered.json.reason).toBe('already_registered')
    expect(api.documents('eventRegistrations').filter((record) => record.status === WAITLISTED)).toHaveLength(1)
  })

  it('spm39_only_attendees_can_join', async () => {
    for (const account of [organiserA1, coordinator]) expect((await join(account)).status, account.uid).toBe(403)
  })
})

describe('SPM-39 — a waiting-list entry is not a registration', () => {
  beforeEach(async () => {
    await join(attendee2)
  })

  it('spm39_the_registered_count_and_list_leave_out_waitlisted_attendees', async () => {
    const response = await listFor(coordinator)
    expect(response.json.registeredCount).toBe(1)
    expect(response.json.registrations).toEqual([expect.objectContaining({ email: attendee.email, status: REGISTERED })])
    expect(response.json.waitingListCount).toBe(1)
  })

  it('spm39_spm41_a_cancellation_notifies_registered_attendees_only', async () => {
    expect((await api.act(coordinator, CANCEL, 'Venue closed', SMALL_ID)).status).toBe(200)
    expect((await api.notificationsOf(attendee)).map((notice) => notice.type)).toContain(ATTENDEE_EVENT_CANCELLED_NOTICE)
    expect((await api.notificationsOf(attendee2)).some((notice) => notice.type === ATTENDEE_EVENT_CANCELLED_NOTICE)).toBe(false)
  })
})
