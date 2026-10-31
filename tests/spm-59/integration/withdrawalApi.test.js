// SPM-59 API suite — in-memory harness (tests/shared/helpers/cancellationApi.js). Real HTTP against the real
// Express app, the registration service and the shared rules. Mocked: token verification and persistence. Not
// database verification: two withdrawals at once are proven on the Firestore emulator (withdrawal.emulator.test.js).
//
// Before each test the seeded two-place event is set to one place, open, withdrawal allowed, starting in 30 days
// (relative to the real clock, which the API reads); `attendee` holds the place.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { REGISTRATION_CONFIRMED_NOTICE, WAITING_LIST_INVITATION_NOTICE } from '../../../shared/notifications.js'
import { ATTENDEE } from '../../../shared/permissions.js'
import { DECLINED, INVITATION_EXPIRED, INVITED, REGISTERED, WAITLISTED, WITHDRAWN, registrationId } from '../../../shared/registration.js'
import { createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, organiserA2, coordinator, attendee, attendee2, attendee3 } = SEED_ACCOUNTS
const SMALL_ID = 'seed-req-a1-confirmed-small'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const api = createCancellationApi()
const first = { uid: 'wait-first', name: 'First Waiting', email: 'wait-first@example.test', roles: [ATTENDEE] }
const second = { uid: 'wait-second', name: 'Second Waiting', email: 'wait-second@example.test', roles: [ATTENDEE] }

const iso = (offset) => new Date(Date.now() + offset).toISOString()
const post = (account, path, id = SMALL_ID) => api.call('POST', `/api/requests/${id}${path}`, account)
const register = (account) => post(account, '/registrations')
const join = (account) => post(account, '/waiting-list')
const withdraw = (account) => post(account, '/registrations/withdraw')
const leave = (account) => post(account, '/waiting-list/leave')
const accept = (account) => post(account, '/invitation/accept')
const decline = (account) => post(account, '/invitation/decline')
const summary = async (account) => (await api.view(account, SMALL_ID)).json.attendeeRegistration
const mine = async (account) => (await api.call('GET', '/api/registrations', account)).json.registrations
const listFor = async (account) => (await api.call('GET', `/api/requests/${SMALL_ID}/registrations`, account)).json
const record = (account) => api.documents('eventRegistrations').find((entry) => entry.attendeeUid === account.uid)
const noticesOf = async (account, type) => (await api.notificationsOf(account)).filter((notice) => notice.type === type)

function setRegistration(changes = {}) {
  const event = api.stored(SMALL_ID)
  api.updateStored(SMALL_ID, {
    core: { ...event.core, preferredDateTime: iso(30 * DAY) },
    registration: { ...event.registration, enabled: true, opensAt: iso(-DAY), closesAt: iso(29 * DAY), capacity: 1, withdrawalAllowed: true, withdrawalClosesAt: null, ...changes },
  })
}

// Moves an invitation's deadline into the past, as if 48 hours had gone by.
function lapse(account) {
  api.putDocument('eventRegistrations', registrationId(SMALL_ID, account.uid), { ...record(account), invitationExpiresAt: iso(-HOUR) })
}

beforeAll(api.start)
afterAll(api.stop)
beforeEach(async () => {
  api.reset()
  for (const { uid, ...profile } of [first, second]) api.putDocument('users', uid, profile)
  setRegistration()
  expect((await register(attendee)).status).toBe(201)
})

describe('SPM-59 AC1 — withdrawal only where the Organiser allows it', () => {
  it('spm59_withdrawal_is_refused_when_the_organiser_has_not_allowed_it', async () => {
    setRegistration({ withdrawalAllowed: false })
    expect(await summary(attendee)).toMatchObject({ canWithdraw: false })
    const refused = await withdraw(attendee)
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('withdrawal_not_allowed')
    expect(record(attendee).status).toBe(REGISTERED)
  })

  it('spm59_withdrawal_is_refused_after_the_organisers_cut_off', async () => {
    setRegistration({ withdrawalClosesAt: iso(-HOUR) })
    expect((await withdraw(attendee)).json.reason).toBe('withdrawal_closed')
  })

  it('spm59_the_owning_organiser_sets_the_conditions_after_confirmation_and_a_colleague_cannot', async () => {
    const saved = await api.call('PATCH', `/api/requests/${SMALL_ID}`, organiserA1, { registration: { withdrawalAllowed: false, withdrawalClosesAt: iso(10 * DAY) } })
    expect(saved.status).toBe(200)
    expect(api.stored(SMALL_ID).registration).toMatchObject({ withdrawalAllowed: false })
    expect((await api.call('PATCH', `/api/requests/${SMALL_ID}`, organiserA2, { registration: { withdrawalAllowed: true } })).status).toBe(403)
    const late = await api.call('PATCH', `/api/requests/${SMALL_ID}`, organiserA1, { registration: { withdrawalClosesAt: iso(31 * DAY) } })
    expect(late.status).toBe(400)
    expect(Object.keys(late.json.errors)).toEqual(['registration.withdrawalClosesAt'])
  })
})

describe('SPM-59 AC2 / AC4 / AC5 — withdrawing releases the place and shows as Withdrawn', () => {
  it('spm59_a_registered_attendee_withdraws_and_the_registered_count_drops_by_one', async () => {
    expect((await listFor(organiserA1)).registeredCount).toBe(1)
    const response = await withdraw(attendee)
    expect(response.status).toBe(200)
    expect(response.json.registration).toMatchObject({ eventRequestId: SMALL_ID, status: WITHDRAWN })
    expect(record(attendee)).toMatchObject({ status: WITHDRAWN, withdrawnAt: expect.any(String) })
    expect((await listFor(organiserA1)).registeredCount).toBe(0)
  })

  it('spm59_the_withdrawn_registration_shows_as_withdrawn', async () => {
    await withdraw(attendee)
    expect(await mine(attendee)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, status: WITHDRAWN })])
    expect((await summary(attendee)).myRegistration).toMatchObject({ status: WITHDRAWN })
  })

  it('spm59_with_no_waiting_list_the_place_reopens_for_anyone', async () => {
    await withdraw(attendee)
    expect((await register(attendee2)).status).toBe(201)
  })

  it('spm59_x8_a_withdrawn_attendee_may_register_again_while_a_place_is_free', async () => {
    await withdraw(attendee)
    expect((await register(attendee)).status).toBe(201)
    expect(record(attendee).status).toBe(REGISTERED)
  })

  it('spm59_only_a_registered_attendee_can_withdraw', async () => {
    expect((await withdraw(attendee2)).json.reason).toBe('not_registered')
    expect((await withdraw(organiserA1)).status).toBe(403)
  })
})

describe('SPM-59 AC3 / AC5 — the freed place goes to the next person on the waiting list, by invitation', () => {
  beforeEach(async () => {
    expect((await join(first)).status).toBe(201)
    expect((await join(second)).status).toBe(201)
  })

  it('spm59_the_first_waiting_attendee_is_invited_and_notified_not_registered', async () => {
    await withdraw(attendee)
    expect(record(first)).toMatchObject({ status: INVITED, invitationExpiresAt: expect.any(String) })
    const hoursLeft = (Date.parse(record(first).invitationExpiresAt) - Date.now()) / HOUR
    expect(hoursLeft).toBeGreaterThan(47.9)
    expect(hoursLeft).toBeLessThanOrEqual(48)
    expect(await noticesOf(first, WAITING_LIST_INVITATION_NOTICE)).toEqual([expect.objectContaining({ eventRequestId: SMALL_ID, invitationExpiresAt: record(first).invitationExpiresAt })])
    expect(await noticesOf(second, WAITING_LIST_INVITATION_NOTICE)).toEqual([])
    expect(await listFor(coordinator)).toMatchObject({ registeredCount: 0, invitedCount: 1, waitingListCount: 1 })
    expect(await summary(second)).toMatchObject({ waitingListPosition: 1 })
  })

  it('spm59_x3_the_place_is_held_for_the_invited_attendee', async () => {
    await withdraw(attendee)
    const refused = await register(attendee3)
    expect(refused.status).toBe(409)
    expect(refused.json.reason).toBe('full')
  })

  it('spm59_x4_accepting_in_time_registers_the_invited_attendee', async () => {
    await withdraw(attendee)
    expect(await summary(first)).toMatchObject({ canRespondToInvitation: true, myRegistration: { status: INVITED } })
    const accepted = await accept(first)
    expect(accepted.status).toBe(200)
    expect(accepted.json.registration).toMatchObject({ status: REGISTERED })
    expect(record(first).status).toBe(REGISTERED)
    expect(await noticesOf(first, REGISTRATION_CONFIRMED_NOTICE)).toHaveLength(1)
    expect((await listFor(organiserA1)).registeredCount).toBe(1)
  })

  it('spm59_x4_declining_passes_the_invitation_to_the_next_person', async () => {
    await withdraw(attendee)
    expect((await decline(first)).status).toBe(200)
    expect(record(first).status).toBe(DECLINED)
    expect(record(second).status).toBe(INVITED)
    expect(await noticesOf(second, WAITING_LIST_INVITATION_NOTICE)).toHaveLength(1)
  })

  it('spm59_x4_x5_an_expired_invitation_passes_on_the_next_time_the_event_is_read', async () => {
    await withdraw(attendee)
    lapse(first)
    await summary(attendee3)
    expect(record(first).status).toBe(INVITATION_EXPIRED)
    expect(record(second).status).toBe(INVITED)
    const late = await accept(first)
    expect(late.status).toBe(409)
    expect(late.json.reason).toBe('invitation_expired')
  })

  it('spm59_when_the_waiting_list_runs_out_the_place_reopens', async () => {
    await withdraw(attendee)
    await decline(first)
    await decline(second)
    expect((await register(attendee3)).status).toBe(201)
  })

  it('spm59_x6_a_place_freed_by_raising_the_capacity_also_goes_to_the_waiting_list_first', async () => {
    expect((await api.call('PATCH', `/api/requests/${SMALL_ID}`, organiserA1, { registration: { capacity: 2 } })).status).toBe(200)
    expect((await register(attendee3)).json.reason).toBe('full')
    expect(record(first).status).toBe(INVITED)
  })

  it('spm59_x7_leaving_the_waiting_list_moves_the_queue_up', async () => {
    const left = await leave(first)
    expect(left.status).toBe(200)
    expect(record(first).status).toBe(WITHDRAWN)
    expect(await summary(second)).toMatchObject({ waitingListPosition: 1 })
    expect((await leave(attendee)).json.reason).toBe('not_waitlisted')
  })

  it('spm59_an_invited_attendee_accepts_rather_than_registering_again', async () => {
    await withdraw(attendee)
    expect((await register(first)).json.reason).toBe('invitation_open')
    expect(record(second).status).toBe(WAITLISTED)
  })
})

describe('SPM-59 — two withdrawals at once', () => {
  it('spm59_two_simultaneous_withdrawals_invite_the_first_two_in_the_queue_once_each', async () => {
    setRegistration({ capacity: 2 })
    expect((await register(attendee2)).status).toBe(201)
    await join(first)
    await join(second)
    const results = await Promise.all([withdraw(attendee), withdraw(attendee2)])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    expect([record(first).status, record(second).status]).toEqual([INVITED, INVITED])
    expect(await noticesOf(first, WAITING_LIST_INVITATION_NOTICE)).toHaveLength(1)
    expect(await noticesOf(second, WAITING_LIST_INVITATION_NOTICE)).toHaveLength(1)
  })
})
