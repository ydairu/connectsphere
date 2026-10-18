// SPM-16 — createTentativeVenueHold refuses any hold whose occupied period conflicts, and writes
// nothing when it does. Real service code against the in-memory Firestore double (not the emulator, not
// a real project).
//
// Concurrency: the double runs each transaction once and never retries, so two calls started together
// would both read before either writes and both succeed. That would be an artefact of the double, so
// this file does not test simultaneous requests. It proves the sequential case and that every hold reads
// and writes the venue's lock document in its transaction; tentativeHoldConcurrency.live.test.js checks
// real simultaneous requests against Firestore.

import { beforeEach, describe, expect, it } from 'vitest'

import { sendVenueError } from '../../../backend/src/controllers/venueController.js'
import {
  createTentativeVenueHold,
  VenueConflictError,
  VenueNotFoundError,
  VenueValidationError,
  venueBookingLockPath,
} from '../../../backend/src/services/venueService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'

const NOW = new Date('2026-10-15T00:00:00.000Z')
const COORDINATOR = { uid: 'coordinator-1', name: 'Coordinator One' }
const LOCK_PATH = venueBookingLockPath('venue-hall').join('/')

function at(time) {
  return `2026-11-20T${time}.000Z`
}

function venue(name, setupMinutes, turnaroundMinutes) {
  return {
    name,
    location: 'Level 1',
    maximumCapacity: 100,
    facilities: ['Projector'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Theatre'],
    operatingHours: 'Daily 08:00-22:00',
    setupMinutes,
    turnaroundMinutes,
  }
}

function entry(overrides) {
  return { venueId: 'venue-hall', status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, startsAt: at('10:00:00'), endsAt: at('12:00:00'), title: 'Existing', eventRequestId: 'request-existing', ...overrides }
}

let db

function seed(availability = {}) {
  db = createFakeFirestore({
    venues: { 'venue-hall': venue('Hall', 30, 45), 'venue-room': venue('Room', 0, 0) },
    venueAvailability: availability,
  })
}

function hold(startsAt, endsAt, overrides = {}) {
  return createTentativeVenueHold(
    { venueId: 'venue-hall', startsAt: at(startsAt), endsAt: at(endsAt), eventRequestId: 'request-new', title: 'New hold', ...overrides },
    COORDINATOR,
    db,
    NOW,
  )
}

function availabilityIds() {
  return [...db.collectionData('venueAvailability').keys()].sort()
}

async function expectRefusedWithNothingWritten(promise, conflict) {
  const before = availabilityIds()
  const lockBefore = db.collectionData('systemLocks').get(venueBookingLockPath('venue-hall')[1])
  await expect(promise).rejects.toMatchObject({ name: 'VenueConflictError', conflict })
  expect(availabilityIds()).toEqual(before)
  expect(db.collectionData('systemLocks').get(venueBookingLockPath('venue-hall')[1])).toEqual(lockBefore)
  const last = db.transactions.at(-1)
  expect(last.committed).toBe(false)
  expect(last.writes).toEqual([])
}

beforeEach(() => seed({ booking: entry() }))

describe('SPM-16 createTentativeVenueHold — conflicts', () => {
  it('spm16_hold_at_1230_conflicts_with_a_booking_ending_1200_plus_45_minutes_turnaround (AC2, AC5)', async () => {
    await expectRefusedWithNothingWritten(hold('12:30:00', '14:00:00'), {
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: at('10:00:00'),
      endsAt: at('12:00:00'),
      occupiedStartsAt: at('09:30:00'),
      occupiedEndsAt: at('12:45:00'),
    })
  })

  it('spm16_hold_whose_setup_starts_exactly_at_1245_is_created (AC4)', async () => {
    const created = await hold('13:15:00', '14:00:00')
    expect(db.collectionData('venueAvailability').get(created.id)).toMatchObject({ startsAt: at('13:15:00'), status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_one_second_of_overlap_is_refused (AC3)', async () => {
    await expectRefusedWithNothingWritten(hold('13:14:59', '14:00:00'), { status: AVAILABILITY_STATUS.CONFIRMED_BOOKING })
  })

  it('spm16_an_active_tentative_hold_blocks (AC5)', async () => {
    seed({ held: entry({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-10-20T00:00:00.000Z' }) })
    await expectRefusedWithNothingWritten(hold('11:00:00', '13:00:00'), { status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_an_expired_hold_does_not_block (AC7)', async () => {
    seed({ expired: entry({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD, holdExpiresAt: '2026-10-14T00:00:00.000Z' }) })
    await expect(hold('10:00:00', '12:00:00')).resolves.toMatchObject({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_a_hold_saved_without_holdExpiresAt_still_blocks', async () => {
    seed({ legacy: entry({ status: AVAILABILITY_STATUS.TENTATIVE_HOLD }) })
    await expectRefusedWithNothingWritten(hold('10:00:00', '12:00:00'), { status: AVAILABILITY_STATUS.TENTATIVE_HOLD })
  })

  it('spm16_cancelled_and_removed_entries_do_not_block', async () => {
    seed({
      cancelled: entry({ lifecycleStatus: 'cancelled' }),
      removed: entry({ status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, lifecycleStatus: 'removed' }),
    })
    await expect(hold('10:00:00', '12:00:00')).resolves.toMatchObject({ venueId: 'venue-hall' })
  })

  it('spm16_maintenance_blocks_apply_without_setup_or_turnaround (AC7)', async () => {
    seed({ block: entry({ status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, startsAt: at('13:00:00'), endsAt: at('14:00:00'), lifecycleStatus: 'active' }) })
    await expectRefusedWithNothingWritten(hold('14:29:59', '15:00:00'), {
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      occupiedStartsAt: at('13:00:00'),
      occupiedEndsAt: at('14:00:00'),
    })
    await expect(hold('14:30:00', '15:00:00')).resolves.toMatchObject({ startsAt: at('14:30:00') })
  })

  it('spm16_a_booking_at_another_venue_does_not_block', async () => {
    seed({ elsewhere: entry({ venueId: 'venue-room' }) })
    await expect(hold('10:00:00', '12:00:00')).resolves.toMatchObject({ venueId: 'venue-hall' })
  })

  it('spm16_each_venue_of_a_multi_venue_event_is_checked_on_its_own (AC8)', async () => {
    seed({ roomBooking: entry({ venueId: 'venue-room', startsAt: at('08:00:00'), endsAt: at('10:00:00') }) })
    const atHall = await hold('10:00:00', '12:00:00', { eventRequestId: 'request-multi' })
    // The room has no setup or turnaround, so it may start when its booking ends, beside the hall hold.
    const atRoom = await hold('10:00:00', '12:00:00', { venueId: 'venue-room', eventRequestId: 'request-multi' })
    expect([atHall.venueId, atRoom.venueId]).toEqual(['venue-hall', 'venue-room'])

    await expect(hold('09:59:59', '12:00:00', { venueId: 'venue-room', eventRequestId: 'request-multi' })).rejects.toBeInstanceOf(VenueConflictError)
  })

  it('spm16_a_second_request_for_the_same_slot_is_refused_after_the_first (AC6, sequential)', async () => {
    seed()
    const first = await hold('10:00:00', '12:00:00')
    await expectRefusedWithNothingWritten(hold('10:00:00', '12:00:00', { eventRequestId: 'request-other' }), {
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
      startsAt: at('10:00:00'),
    })
    expect(availabilityIds()).toEqual([first.id])
  })

  it('spm16_the_same_event_cannot_re_hold_the_venue_over_its_own_hold', async () => {
    seed()
    await hold('10:00:00', '12:00:00')
    await expect(hold('11:00:00', '13:00:00')).rejects.toBeInstanceOf(VenueConflictError)
  })
})

describe('SPM-16 conflict message in Singapore time (walkthrough fix A)', () => {
  it('spm16_a_conflict_crossing_midnight_in_singapore_names_both_dates', async () => {
    // 15:00–16:30 UTC is 23:00–00:30 SGT; with the hall's 30/45 minutes it occupies 22:30–01:15 SGT.
    seed({ late: entry({ startsAt: at('15:00:00'), endsAt: at('16:30:00') }) })
    const error = await hold('16:00:00', '17:00:00').catch((caught) => caught)
    expect(error).toBeInstanceOf(VenueConflictError)
    expect(error.errors.time).toBe('This venue has a confirmed booking occupying it on Fri 20 Nov 2026, 22:30 – Sat 21 Nov 2026, 01:15 SGT.')
    expect(error.conflict).toMatchObject({ occupiedStartsAt: at('14:30:00'), occupiedEndsAt: at('17:15:00') })
  })
})

describe('SPM-16 createTentativeVenueHold — record, lock and validation', () => {
  it('spm16_new_hold_is_active_and_expires_seven_days_after_the_injected_now', async () => {
    seed()
    const created = await hold('10:00:00', '12:00:00')
    const stored = db.collectionData('venueAvailability').get(created.id)
    expect(stored).toEqual({
      venueId: 'venue-hall',
      status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
      eventRequestId: 'request-new',
      startsAt: at('10:00:00'),
      endsAt: at('12:00:00'),
      title: 'New hold',
      lifecycleStatus: 'active',
      holdExpiresAt: '2026-10-22T00:00:00.000Z',
      createdByUid: COORDINATOR.uid,
      createdByName: COORDINATOR.name,
      createdAt: NOW.toISOString(),
    })
    expect(created).toEqual({ id: created.id, ...stored })
  })

  it('spm16_the_hold_transaction_reads_the_venue_and_reads_and_writes_the_venue_lock (AC6)', async () => {
    seed()
    const created = await hold('10:00:00', '12:00:00')
    const transaction = db.transactions.at(-1)
    expect(transaction.committed).toBe(true)
    expect(transaction.reads).toEqual(['venues/venue-hall', LOCK_PATH, 'venueAvailability'])
    expect(transaction.writes).toEqual([`venueAvailability/${created.id}`, LOCK_PATH])
    expect(db.collectionData('systemLocks').get('venueBooking-venue-hall')).toEqual({
      venueId: 'venue-hall',
      lastCommitmentId: created.id,
      updatedAt: NOW.toISOString(),
    })
  })

  it('spm16_unknown_venue_is_refused_with_nothing_written', async () => {
    await expect(hold('10:00:00', '12:00:00', { venueId: 'venue-missing' })).rejects.toBeInstanceOf(VenueNotFoundError)
    expect(availabilityIds()).toEqual(['booking'])
  })

  it('spm16_invalid_times_or_a_missing_actor_are_refused_before_any_read', async () => {
    const transactionsBefore = db.transactions.length
    await expect(hold('12:00:00', '10:00:00')).rejects.toBeInstanceOf(VenueValidationError)
    await expect(
      createTentativeVenueHold({ venueId: 'venue-hall', startsAt: at('13:15:00'), endsAt: at('14:00:00') }, null, db, NOW),
    ).rejects.toMatchObject({ errors: { createdByUid: 'An authenticated staff member is required.' } })
    expect(db.transactions.length).toBe(transactionsBefore)
    expect(availabilityIds()).toEqual(['booking'])
  })

  it('spm16_a_conflict_maps_to_409_naming_type_and_period_but_not_the_other_event', async () => {
    const error = await hold('12:30:00', '14:00:00').catch((caught) => caught)
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }
    sendVenueError(error, res, () => {})
    expect(res.statusCode).toBe(409)
    expect(res.body.conflict).toEqual({
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: at('10:00:00'),
      endsAt: at('12:00:00'),
      occupiedStartsAt: at('09:30:00'),
      occupiedEndsAt: at('12:45:00'),
    })
    // Walkthrough fix A: the message names the occupied period in Singapore time; `conflict` keeps ISO values.
    expect(res.body.message).toBe('The venue is not available for that period.')
    expect(res.body.errors.time).toBe('This venue has a confirmed booking occupying it on Fri 20 Nov 2026, 17:30–20:45 SGT.')
    // Neither the other entry's title, event, nor id is returned.
    expect(JSON.stringify(res.body)).not.toContain('Existing')
    expect(JSON.stringify(res.body)).not.toContain('request-existing')
    expect(res.body.conflict).not.toHaveProperty('id')
  })
})
