import { beforeEach, describe, expect, it } from 'vitest'
import { BOOKINGS, listEventVenueBookings, listVenueBookingQueue, rejectVenueBooking, submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { coordinator, fixture, input, now, organiser, secondStaff, staff } from '../../spm-14/fixtures.js'

let db
beforeEach(() => { db = fixture() })
const submit = (overrides = {}) => submitVenueBooking('event', { ...input, ...overrides }, coordinator, db, now)
const reject = (id, body = { action: 'reject', reason: 'Layout unavailable', suggestedAlternative: 'Try the smaller room' }, actor = staff) =>
  rejectVenueBooking('event', id, body, actor, db, now)
const values = (name) => [...db.collectionData(name).values()]

describe('SPM-34 atomic booking rejection (in-memory persistence)', () => {
  it('rejects only the selected booking, frees its hold, saves details and notifies the assigned Coordinator', async () => {
    const first = await submit()
    const other = await submit({ venueId: 'room', submissionKey: 'other' })
    db.store.get('event').arrangementApprovals = { venue: { decision: 'approved' }, technical: { decision: 'approved' } }
    const rejected = await reject(first.id)
    expect(rejected).toMatchObject({ status: 'rejected', rejectionReason: 'Layout unavailable', suggestedAlternative: 'Try the smaller room' })
    expect(db.collectionData('venueAvailability').get(db.collectionData(BOOKINGS).get(first.id).holdId).lifecycleStatus).toBe('removed')
    expect(db.collectionData('venueAvailability').get(db.collectionData(BOOKINGS).get(other.id).holdId).lifecycleStatus).toBe('active')
    expect(db.collectionData(BOOKINGS).get(other.id).status).toBe('pending')
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(db.store.get('event').arrangementApprovals).toEqual({ technical: { decision: 'approved' } })
    expect((await listVenueBookingQueue(staff, db)).bookings).toEqual([])
    expect((await listEventVenueBookings('event', coordinator, db)).bookings.find((b) => b.id === first.id).rejectionReason).toBe('Layout unavailable')
    expect(values('notifications')).toEqual([expect.objectContaining({ recipientUid: coordinator.uid, reason: 'Layout unavailable', bookingRequestId: first.id })])
    expect(values('eventRequests/event/activity')).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'venue_booking_rejected', bookingRequestId: first.id })]))
  })
  it('allows replacement after release and preserves the old rejection', async () => {
    const first = await submit()
    await reject(first.id, { action: 'reject', reason: 'No access' })
    const next = await submit({ venueId: 'room', submissionKey: 'replacement', replacesId: first.id })
    expect(next.status).toBe('pending')
    expect(db.collectionData(BOOKINGS).get(first.id)).toMatchObject({ status: 'rejected', replacedById: next.id, rejectionReason: 'No access' })
    expect(values('venueAvailability').filter((v) => v.lifecycleStatus === 'active')).toHaveLength(1)
  })
  it('makes the released period available to another event', async () => {
    const first = await submit()
    await reject(first.id)
    db.store.get('other').assignedCoordinatorUid = coordinator.uid
    const second = await submitVenueBooking('other', { ...input, submissionKey: 'other-event' }, coordinator, db, now)
    expect(second.venueId).toBe(first.venueId)
    expect(db.collectionData(BOOKINGS).get(first.id).status).toBe('rejected')
  })
  it('notifies the current Coordinator if the event was reassigned before rejection', async () => {
    const first = await submit()
    db.store.get('event').assignedCoordinatorUid = 'replacement-coordinator'
    await reject(first.id)
    expect(values('notifications')[0].recipientUid).toBe('replacement-coordinator')
  })
  it('refuses unauthorised, invalid and repeated decisions without writes', async () => {
    const first = await submit()
    const before = values('venueAvailability')
    await expect(reject(first.id, undefined, organiser)).rejects.toMatchObject({ status: 403 })
    await expect(reject(first.id, undefined, secondStaff)).rejects.toMatchObject({ status: 404 })
    await expect(reject('missing')).rejects.toMatchObject({ status: 404 })
    await expect(reject(first.id, { action: 'reject', reason: '   ' })).rejects.toMatchObject({ errors: { reason: expect.any(String) } })
    expect(values('venueAvailability')).toEqual(before)
    db.store.get('event').status = CONFIRMED
    await expect(reject(first.id)).rejects.toMatchObject({ status: 409 })
    db.store.get('event').status = PLANNING
    await reject(first.id)
    await expect(reject(first.id)).rejects.toMatchObject({ status: 409 })
    expect(values('notifications')).toHaveLength(1)
  })
  it('rolls back every change if an activity write fails', async () => {
    const first = await submit()
    const original = structuredClone([values(BOOKINGS), values('venueAvailability'), values('notifications'), db.store.get('event')])
    const run = db.runTransaction.bind(db)
    db.runTransaction = (callback) => run((tx) => callback({ ...tx, set(ref, value) {
      if (ref.path.includes('/activity/')) throw new Error('Injected write failure')
      tx.set(ref, value)
    } }))
    await expect(reject(first.id)).rejects.toThrow('Injected write failure')
    expect([values(BOOKINGS), values('venueAvailability'), values('notifications'), db.store.get('event')]).toEqual(original)
  })
})
