// SPM-59 — withdrawal and the waiting-list invitation, as rules in shared/registration.js and shared/eventRequest.js.
// Pure functions; the API suite checks the backend applies them in the locked registration transaction.
//
// Acceptance criteria (Product Backlog, SPM-59; AC3 also covers SPM-39's former AC4):
//   AC1 withdrawal only where the Organiser allows it, on the Organiser's conditions
//   AC2 a registered Attendee confirms Withdraw Registration → registration cancelled, place released
//   AC3 a released place goes to the next person on the waiting list, who is notified and invited to apply
//   AC4 a withdrawn registration shows as Withdrawn
//   AC5 the registered count drops by one; with a waiting list the freed place follows the invitation process

import { describe, expect, it } from 'vitest'

import { normaliseEventRequestInput, normaliseRegistrationSettings } from '../../../shared/eventRequest.js'
import { WAITING_LIST_INVITATION_NOTICE, waitingListInvitationNotifications } from '../../../shared/notifications.js'
import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import {
  DECLINED,
  EVENT_CLOSED,
  EVENT_STARTED,
  INVITATION_EXPIRED,
  INVITATION_HOURS,
  INVITATION_OPEN,
  INVITED,
  NO_INVITATION,
  NOT_ATTENDEE,
  NOT_REGISTERED,
  NOT_WAITLISTED,
  REGISTERED,
  WAITLISTED,
  WITHDRAWAL_CLOSED,
  WITHDRAWAL_NOT_ALLOWED,
  WITHDRAWN,
  attendeeRegistrationSummary,
  canJoinWaitingList,
  canLeaveWaitingList,
  canRegister,
  canRespondToInvitation,
  canWithdraw,
  invitationExpiresAt,
  isActiveRegistration,
  placesHeld,
  presentOwnRegistration,
  registrationSettingsErrors,
  settleWaitingList,
} from '../../../shared/registration.js'
import { CANCELLED, CONFIRMED, PLANNING, PREPARATION } from '../../../shared/status.js'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-11-01T00:00:00.000Z')
const attendee = { uid: 'att-1', roles: [ATTENDEE] }
const organiser = { uid: 'org-1', roles: [ORGANISER] }
const event = (changes = {}, registration = {}) => ({
  id: 'event-1',
  status: CONFIRMED,
  ownerUid: organiser.uid,
  core: { title: 'Partner Forum', preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: 3 },
  registration: { enabled: true, opensAt: '2026-10-25T00:00:00.000Z', closesAt: '2026-11-19T00:00:00.000Z', capacity: 1, withdrawalAllowed: true, ...registration },
  ...changes,
})
const registered = (uid = 'att-1') => ({ attendeeUid: uid, status: REGISTERED })
const waiting = (uid, waitlistSequence) => ({ attendeeUid: uid, status: WAITLISTED, waitlistSequence })
const invited = (uid, expiresAt) => ({ attendeeUid: uid, status: INVITED, invitationExpiresAt: expiresAt })

describe('SPM-59 AC1 — withdrawal only where the Organiser allows it', () => {
  it('spm59_a_registered_attendee_may_withdraw_when_the_organiser_allows_it', () => {
    expect(canWithdraw(attendee, event(), { existing: registered(), now: NOW })).toEqual({ allowed: true, reason: null })
  })

  it('spm59_x1_withdrawal_is_refused_when_the_organiser_has_not_allowed_it', () => {
    expect(canWithdraw(attendee, event({}, { withdrawalAllowed: false }), { existing: registered(), now: NOW }).reason).toBe(WITHDRAWAL_NOT_ALLOWED)
    expect(canWithdraw(attendee, event({}, { withdrawalAllowed: undefined }), { existing: registered(), now: NOW }).reason).toBe(WITHDRAWAL_NOT_ALLOWED)
  })

  it('spm59_x1_the_organisers_cut_off_and_the_event_start_end_withdrawal', () => {
    const cutOff = event({}, { withdrawalClosesAt: '2026-10-31T00:00:00.000Z' })
    expect(canWithdraw(attendee, cutOff, { existing: registered(), now: NOW }).reason).toBe(WITHDRAWAL_CLOSED)
    expect(canWithdraw(attendee, event(), { existing: registered(), now: new Date('2026-11-20T09:00:00.000Z') }).reason).toBe(EVENT_STARTED)
    expect(canWithdraw(attendee, event({ status: CANCELLED }), { existing: registered(), now: NOW }).reason).toBe(EVENT_CLOSED)
  })

  it('spm59_withdrawal_is_still_possible_while_the_event_is_being_rearranged_or_in_preparation', () => {
    for (const status of [PLANNING, PREPARATION]) {
      expect(canWithdraw(attendee, event({ status }), { existing: registered(), now: NOW }).allowed, status).toBe(true)
    }
  })

  it('spm59_only_a_registered_attendee_can_withdraw', () => {
    expect(canWithdraw(attendee, event(), { existing: null, now: NOW }).reason).toBe(NOT_REGISTERED)
    expect(canWithdraw(attendee, event(), { existing: waiting('att-1', 1), now: NOW }).reason).toBe(NOT_REGISTERED)
    expect(canWithdraw(organiser, event(), { existing: registered('org-1'), now: NOW }).reason).toBe(NOT_ATTENDEE)
  })

  it('spm59_x1_the_organiser_sets_withdrawal_and_its_cut_off_which_must_be_by_the_event_start', () => {
    const { eventRequest, errors } = normaliseEventRequestInput({ core: { preferredDateTime: '2026-11-20T09:00:00Z' }, registration: { withdrawalAllowed: true, withdrawalClosesAt: '2026-11-18T00:00:00Z' } })
    expect(errors).toEqual({})
    expect(eventRequest.registration).toMatchObject({ withdrawalAllowed: true, withdrawalClosesAt: '2026-11-18T00:00:00Z' })
    expect(registrationSettingsErrors({ withdrawalClosesAt: '2026-11-21T00:00:00Z' }, { preferredDateTime: '2026-11-20T09:00:00Z' })).toEqual({ 'registration.withdrawalClosesAt': 'Withdrawal must close by the event start.' })
    expect(normaliseRegistrationSettings({ withdrawalAllowed: 'yes' }).errors).toEqual({ 'registration.withdrawalAllowed': 'Must be true or false.' })
  })
})

describe('SPM-59 AC2 / AC5 — a withdrawal releases the place', () => {
  it('spm59_withdrawn_and_waiting_entries_hold_no_place_registered_and_open_invitations_do', () => {
    const entries = [registered('a'), { attendeeUid: 'b', status: WITHDRAWN }, waiting('c', 1), invited('d', '2026-11-02T00:00:00.000Z'), invited('e', '2026-10-31T00:00:00.000Z')]
    expect(placesHeld(entries, NOW)).toBe(2)
    expect(isActiveRegistration({ status: WITHDRAWN })).toBe(false)
    expect(isActiveRegistration({ status: INVITED })).toBe(false)
  })

  it('spm59_with_no_one_waiting_the_released_place_simply_reopens', () => {
    const settled = settleWaitingList(event(), [{ attendeeUid: 'att-1', status: WITHDRAWN }], { now: NOW })
    expect(settled.updates).toEqual([])
    expect(canRegister({ uid: 'att-2', roles: [ATTENDEE] }, event(), { registeredCount: 0, now: NOW }).allowed).toBe(true)
  })
})

describe('SPM-59 AC3 — the next person on the waiting list is invited, not registered', () => {
  it('spm59_the_first_in_the_queue_is_invited_with_an_expiry_and_never_registered_automatically', () => {
    const entries = [{ attendeeUid: 'att-1', status: WITHDRAWN }, waiting('second', 2), waiting('first', 1)]
    const { updates, invited: invitedEntries } = settleWaitingList(event(), entries, { now: NOW })
    expect(updates).toEqual([{ attendeeUid: 'first', changes: { status: INVITED, invitedAt: NOW.toISOString(), invitationExpiresAt: new Date(NOW.getTime() + INVITATION_HOURS * HOUR).toISOString(), updatedAt: NOW.toISOString() } }])
    expect(invitedEntries.map((entry) => entry.attendeeUid)).toEqual(['first'])
  })

  it('spm59_two_free_places_invite_the_first_two_in_order', () => {
    const { updates } = settleWaitingList(event({}, { capacity: 2 }), [waiting('c', 3), waiting('a', 1), waiting('b', 2)], { now: NOW })
    expect(updates.map((update) => update.attendeeUid)).toEqual(['a', 'b'])
  })

  it('spm59_x2_an_invitation_lasts_48_hours_but_ends_when_registration_closes_or_the_event_starts', () => {
    expect(INVITATION_HOURS).toBe(48)
    expect(invitationExpiresAt(event(), NOW)).toBe('2026-11-03T00:00:00.000Z')
    expect(invitationExpiresAt(event(), new Date('2026-11-18T12:00:00.000Z'))).toBe('2026-11-19T00:00:00.000Z')
    expect(invitationExpiresAt(event({}, { closesAt: '2026-11-21T00:00:00.000Z' }), new Date('2026-11-19T12:00:00.000Z'))).toBe('2026-11-20T09:00:00.000Z')
  })

  it('spm59_no_one_is_invited_once_registration_has_closed', () => {
    expect(settleWaitingList(event(), [waiting('a', 1)], { now: new Date('2026-11-19T00:00:00.000Z') }).updates).toEqual([])
  })

  it('spm59_x4_an_expired_invitation_lapses_and_the_next_person_is_invited', () => {
    const entries = [invited('late', '2026-10-31T23:00:00.000Z'), waiting('next', 4)]
    const { updates, expired } = settleWaitingList(event(), entries, { now: NOW })
    expect(updates[0]).toEqual({ attendeeUid: 'late', changes: { status: INVITATION_EXPIRED, updatedAt: NOW.toISOString() } })
    expect(updates[1]).toMatchObject({ attendeeUid: 'next', changes: { status: INVITED } })
    expect(expired.map((entry) => entry.attendeeUid)).toEqual(['late'])
  })

  it('spm59_x3_an_open_invitation_holds_its_place_so_no_one_else_is_invited_into_it', () => {
    expect(settleWaitingList(event(), [invited('held', '2026-11-02T00:00:00.000Z'), waiting('next', 1)], { now: NOW }).updates).toEqual([])
    expect(canRegister({ uid: 'outsider', roles: [ATTENDEE] }, event(), { registeredCount: 1, now: NOW }).reason).toBe('full')
  })

  it('spm59_x4_the_invited_attendee_may_accept_or_decline_only_while_the_invitation_is_open', () => {
    expect(canRespondToInvitation(attendee, invited('att-1', '2026-11-02T00:00:00.000Z'), NOW)).toEqual({ allowed: true, reason: null })
    expect(canRespondToInvitation(attendee, invited('att-1', '2026-10-31T00:00:00.000Z'), NOW).reason).toBe(INVITATION_EXPIRED)
    expect(canRespondToInvitation(attendee, waiting('att-1', 1), NOW).reason).toBe(NO_INVITATION)
    expect(canRespondToInvitation(attendee, { attendeeUid: 'att-1', status: DECLINED }, NOW).reason).toBe(NO_INVITATION)
  })

  it('spm59_an_invited_attendee_accepts_their_invitation_rather_than_registering_or_rejoining', () => {
    const existing = invited('att-1', '2026-11-02T00:00:00.000Z')
    expect(canRegister(attendee, event({}, { capacity: 5 }), { existing, registeredCount: 1, now: NOW }).reason).toBe(INVITATION_OPEN)
    expect(canJoinWaitingList(attendee, event(), { existing, registeredCount: 1, now: NOW }).reason).toBe(INVITATION_OPEN)
  })

  it('spm59_the_invitation_notice_names_the_event_and_the_deadline', () => {
    const [notice] = waitingListInvitationNotifications(event(), { attendeeUid: 'first', invitationExpiresAt: '2026-11-03T00:00:00.000Z' }, { at: NOW.toISOString() })
    expect(notice).toMatchObject({
      recipientUid: 'first',
      type: WAITING_LIST_INVITATION_NOTICE,
      eventRequestId: 'event-1',
      invitationExpiresAt: '2026-11-03T00:00:00.000Z',
      message: 'A place is available for “Partner Forum”. Accept it before your invitation expires, or it passes to the next person.',
    })
  })
})

describe('SPM-59 AC4 — a withdrawn registration shows as Withdrawn; X7 leaving the waiting list', () => {
  it('spm59_a_withdrawn_registration_is_presented_as_withdrawn', () => {
    expect(presentOwnRegistration({ eventRequestId: 'event-1', status: WITHDRAWN, withdrawnAt: NOW.toISOString() })).toMatchObject({ status: WITHDRAWN, withdrawnAt: NOW.toISOString() })
  })

  it('spm59_x7_a_waitlisted_attendee_may_leave_the_waiting_list', () => {
    expect(canLeaveWaitingList(attendee, waiting('att-1', 1))).toEqual({ allowed: true, reason: null })
    expect(canLeaveWaitingList(attendee, registered()).reason).toBe(NOT_WAITLISTED)
  })

  it('spm59_x8_a_withdrawn_attendee_may_register_or_join_again_like_anyone_else', () => {
    const existing = { attendeeUid: 'att-1', status: WITHDRAWN }
    expect(canRegister(attendee, event(), { existing, registeredCount: 0, now: NOW }).allowed).toBe(true)
    expect(canJoinWaitingList(attendee, event(), { existing, registeredCount: 1, now: NOW }).allowed).toBe(true)
  })

  it('spm59_the_event_summary_says_whether_the_attendee_may_withdraw_or_answer_an_invitation', () => {
    expect(attendeeRegistrationSummary(attendee, event(), { existing: { ...registered(), eventRequestId: 'event-1' }, registeredCount: 1, now: NOW })).toMatchObject({ canWithdraw: true, canRespondToInvitation: false })
    expect(attendeeRegistrationSummary(attendee, event({}, { withdrawalAllowed: false }), { existing: { ...registered(), eventRequestId: 'event-1' }, registeredCount: 1, now: NOW }).canWithdraw).toBe(false)
    const summary = attendeeRegistrationSummary(attendee, event(), { existing: { ...invited('att-1', '2026-11-02T00:00:00.000Z'), eventRequestId: 'event-1' }, registeredCount: 1, now: NOW })
    expect(summary).toMatchObject({ canRespondToInvitation: true, myRegistration: { status: INVITED, invitationExpiresAt: '2026-11-02T00:00:00.000Z' } })
  })
})
