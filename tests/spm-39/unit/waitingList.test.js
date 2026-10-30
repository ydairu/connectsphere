// SPM-39 — the waiting-list rules in shared/registration.js. Pure functions; the API suite checks that the
// backend applies them in the locked registration transaction.
//
// Acceptance criteria (Product Backlog, SPM-39; AC4 moved to SPM-59 on 29 Oct 2026):
//   AC1 full event, registration open → the Attendee is offered the waiting list
//   AC2 registration closed → they cannot join it
//   AC3 joining adds them in the order they joined, first come, first served

import { describe, expect, it } from 'vitest'

import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import {
  ALREADY_REGISTERED,
  ALREADY_WAITLISTED,
  CLOSED,
  FULL,
  NOT_ATTENDEE,
  NOT_CONFIGURED,
  NOT_ENABLED,
  NOT_FULL,
  NOT_OPEN_YET,
  REGISTERED,
  WAITLISTED,
  WRONG_STATUS,
  attendeeRegistrationSummary,
  buildWaitlistEntry,
  canJoinWaitingList,
  isActiveRegistration,
  waitingListPosition,
} from '../../../shared/registration.js'
import { CONFIRMED, PLANNING, PREPARATION } from '../../../shared/status.js'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const attendee = { uid: 'att-1', roles: [ATTENDEE], name: 'Ada', email: 'ada@example.test' }
const organiser = { uid: 'org-1', roles: [ORGANISER] }
const event = (changes = {}) => ({
  id: 'event-1',
  status: CONFIRMED,
  ownerUid: organiser.uid,
  core: { title: 'Partner Forum', preferredDateTime: '2026-11-20T09:00:00.000Z', durationHours: 3 },
  registration: { enabled: true, opensAt: '2026-10-25T00:00:00.000Z', closesAt: '2026-11-19T00:00:00.000Z', capacity: 2 },
  ...changes,
})
const withRegistration = (changes) => event({ registration: { ...event().registration, ...changes } })
const full = { now: NOW, registeredCount: 2 }

describe('SPM-39 AC1 — a full event with registration open offers the waiting list', () => {
  it('spm39_a_full_open_event_lets_an_attendee_join_the_waiting_list', () => {
    expect(canJoinWaitingList(attendee, event(), full)).toMatchObject({ allowed: true, reason: null })
  })

  it('spm39_it_stays_offered_during_preparation', () => {
    expect(canJoinWaitingList(attendee, event({ status: PREPARATION }), full).allowed).toBe(true)
  })

  it('spm39_w4_with_places_left_the_attendee_registers_instead', () => {
    expect(canJoinWaitingList(attendee, event(), { now: NOW, registeredCount: 1 })).toMatchObject({ allowed: false, reason: NOT_FULL })
  })

  it('spm39_the_event_summary_offers_the_waiting_list_when_full', () => {
    expect(attendeeRegistrationSummary(attendee, event(), full)).toMatchObject({
      canRegister: false,
      reason: FULL,
      canJoinWaitingList: true,
      waitingListPosition: null,
      myRegistration: null,
    })
    expect(attendeeRegistrationSummary(attendee, event(), { now: NOW, registeredCount: 0 })).toMatchObject({ canRegister: true, canJoinWaitingList: false })
  })
})

describe('SPM-39 AC2 — registration closed means no waiting list', () => {
  it('spm39_a_full_event_whose_registration_has_closed_cannot_be_joined', () => {
    expect(canJoinWaitingList(attendee, event(), { ...full, now: new Date('2026-11-19T00:00:00.000Z') })).toMatchObject({ allowed: false, reason: CLOSED })
  })

  it('spm39_nor_before_registration_opens_nor_when_disabled_unset_or_not_confirmed', () => {
    expect(canJoinWaitingList(attendee, event(), { ...full, now: new Date('2026-10-24T00:00:00.000Z') }).reason).toBe(NOT_OPEN_YET)
    expect(canJoinWaitingList(attendee, withRegistration({ enabled: false }), full).reason).toBe(NOT_ENABLED)
    expect(canJoinWaitingList(attendee, withRegistration({ capacity: null }), full).reason).toBe(NOT_CONFIGURED)
    expect(canJoinWaitingList(attendee, event({ status: PLANNING }), full).reason).toBe(WRONG_STATUS)
  })

  it('spm39_the_summary_does_not_offer_it_once_closed', () => {
    const summary = attendeeRegistrationSummary(attendee, event(), { ...full, now: new Date('2026-11-19T00:00:00.000Z') })
    expect(summary).toMatchObject({ canRegister: false, reason: CLOSED, canJoinWaitingList: false })
  })
})

describe('SPM-39 AC3 — first come, first served', () => {
  const entry = (uid, waitlistSequence, status = WAITLISTED) => ({ attendeeUid: uid, status, waitlistSequence })

  it('spm39_position_follows_the_order_joined_not_the_attendee_id', () => {
    const entries = [entry('zed', 1), entry('amy', 3), entry('mo', 2), entry('reg', null, REGISTERED)]
    expect(waitingListPosition(entries, 'zed')).toBe(1)
    expect(waitingListPosition(entries, 'mo')).toBe(2)
    expect(waitingListPosition(entries, 'amy')).toBe(3)
    expect(waitingListPosition(entries, 'reg')).toBeNull()
    expect(waitingListPosition(entries, 'nobody')).toBeNull()
  })

  it('spm39_a_waiting_list_entry_records_the_attendee_the_event_and_its_place_in_the_queue', () => {
    expect(buildWaitlistEntry(event(), attendee, { venueNames: ['Hall A'], waitlistSequence: 4, at: NOW.toISOString() })).toEqual({
      eventRequestId: 'event-1',
      attendeeUid: 'att-1',
      attendeeName: 'Ada',
      attendeeEmail: 'ada@example.test',
      status: WAITLISTED,
      waitlistSequence: 4,
      waitlistedAt: NOW.toISOString(),
      registeredAt: null,
      eventTitle: 'Partner Forum',
      eventStartsAt: '2026-11-20T09:00:00.000Z',
      eventDurationHours: 3,
      venueNames: ['Hall A'],
      updatedAt: NOW.toISOString(),
    })
  })

  it('spm39_an_attendee_joins_once_and_not_while_registered', () => {
    expect(canJoinWaitingList(attendee, event(), { ...full, existing: { status: WAITLISTED } }).reason).toBe(ALREADY_WAITLISTED)
    expect(canJoinWaitingList(attendee, event(), { ...full, existing: { status: REGISTERED } }).reason).toBe(ALREADY_REGISTERED)
    expect(canJoinWaitingList(organiser, event(), full).reason).toBe(NOT_ATTENDEE)
  })

  it('spm39_the_summary_tells_a_waitlisted_attendee_their_position', () => {
    const summary = attendeeRegistrationSummary(attendee, event(), { ...full, existing: { eventRequestId: 'event-1', status: WAITLISTED, waitlistSequence: 2 }, waitingListPosition: 2 })
    expect(summary).toMatchObject({ canRegister: false, canJoinWaitingList: false, waitingListPosition: 2, myRegistration: { status: WAITLISTED, waitingListPosition: 2 } })
  })
})

describe('SPM-39 — a waiting-list entry is not a registration', () => {
  it('spm39_waitlisted_entries_do_not_count_as_registered', () => {
    expect(isActiveRegistration({ status: WAITLISTED })).toBe(false)
  })
})
