import { beforeEach, describe, expect, it } from 'vitest'
import { approveVenueBooking, rejectVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../backend/src/services/statusTransitionService.js'
import { normaliseVenueBooking, venueBookingReadiness, venueNeedId } from '../../shared/venueBooking.js'
import { APPROVE_VENUE } from '../../shared/requestActions.js'
import { CONFIRM } from '../../shared/statusTransitions.js'
import { CONFIRMED } from '../../shared/status.js'
import { SAFETY_APPROVED } from '../../shared/safetyReview.js'
import { coordinator, fixture, input, now, staff, secondStaff } from '../spm-14/fixtures.js'

describe('SPM-79 venue needs', () => {
  it('validates per-venue attendance and derives old replacement chains', () => {
    for (const attendeeCount of [0, -1, 1.5, '30', undefined]) {
      expect(normaliseVenueBooking({ ...input, attendeeCount }).errors.attendeeCount).toBeTruthy()
    }
    const old = { id: 'old', status: 'rejected' }
    const replacement = { id: 'new', replacesId: 'old', status: 'approved' }
    expect(venueNeedId(replacement, [old, replacement])).toBe('old')
    expect(venueBookingReadiness([old, replacement]).ready).toBe(true)
    expect(venueBookingReadiness([]).ready).toBe(false)
    for (const status of ['pending', 'rejected', 'expired', 'replaced']) {
      expect(venueBookingReadiness([{ id: 'one', status }]).ready).toBe(false)
    }
    expect(venueBookingReadiness([{ id: 'one', status: 'approved' }, { id: 'two', status: 'rejected' }]).ready).toBe(false)
  })
})

describe('SPM-79 booking and Confirm transactions', () => {
  let db
  beforeEach(() => { db = fixture(); db.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false } })
  const request = (values) => submitVenueBooking('event', { ...input, ...values }, coordinator, db, now)
  // SPM-91/92: Confirm also needs a safety approval. Requesting a venue withdraws one (SPM-91), so it is
  // recorded just before each Confirm, and these tests turn on the venue bookings alone.
  const confirm = () => {
    db.store.get('event').safetyReview = { status: SAFETY_APPROVED }
    return transitionEventRequest('event', CONFIRM, coordinator, db, now)
  }
  it('keeps separate holds, decisions and needs; replaces only the rejected need', async () => {
    const hall = await request({ startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z' })
    const room = await request({ venueId: 'room', attendeeCount: 30, startsAt: '2027-03-01T11:00:00Z', submissionKey: 'room' })
    expect(hall.venueNeedId).toBe(hall.id)
    expect(room.venueNeedId).toBe(room.id)
    expect(db.collectionData('venueAvailability').size).toBe(2)
    await approveVenueBooking('event', hall.id, { action: 'approve' }, staff, db, now)
    await rejectVenueBooking('event', room.id, { action: 'reject', reason: 'Unavailable' }, secondStaff, db, now)
    await expect(confirm()).rejects.toMatchObject({ reason: 'arrangements_not_approved' })
    expect([...db.collectionData('venueAvailability').values()].find((hold) => hold.bookingRequestId === hall.id).status).toBe('confirmed_booking')
    const next = await request({ venueId: 'room', attendeeCount: 30, replacesId: room.id, submissionKey: 'room-next' })
    expect(next.venueNeedId).toBe(room.id)
    await expect(confirm()).rejects.toMatchObject({ reason: 'arrangements_not_approved' })
    await approveVenueBooking('event', next.id, { action: 'approve' }, secondStaff, db, now)
    expect((await confirm()).status).toBe(CONFIRMED)
  })
  it('rejects invalid interval, capacity and legacy venue action without writes', async () => {
    for (const values of [
      { startsAt: '2027-03-01T09:00:00Z' }, { endsAt: '2027-03-01T13:00:00Z' },
      { attendeeCount: 101 }, { attendeeCount: 51 },
    ]) await expect(request(values)).rejects.toBeTruthy()
    expect(db.collectionData('venueBookingRequests').size).toBe(0)
    expect(db.collectionData('venueAvailability').size).toBe(0)
    db.store.get('event').assignedStaffUids = [staff.uid]
    await expect(transitionEventRequest('event', APPROVE_VENUE, staff, db, now)).rejects.toMatchObject({ reason: 'venue_bookings_decide' })
    expect(db.store.get('event').arrangementApprovals).toBeUndefined()
  })
})
