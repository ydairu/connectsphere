import { beforeEach, describe, expect, it } from 'vitest'
import { BOOKINGS, listEventVenueBookings, listVenueBookingQueue, rejectVenueBooking, submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { BOOKING_REJECTED } from '../../../shared/venueBooking.js'
import { CANCEL, REJECT, APPROVE_CANCELLATION } from '../../../shared/statusTransitions.js'
import { REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { coordinator, staff, secondStaff, organiser, fixture, input, now } from '../fixtures.js'

let db
beforeEach(() => { db = fixture() })
const submit = (overrides = {}, eventId = 'event', actor = coordinator) => submitVenueBooking(eventId, { ...input, ...overrides }, actor, db, now)
const values = (collection) => [...db.collectionData(collection).values()]

describe('SPM-14 transactions (in-memory, not database concurrency)', () => {
  it('creates a request, scoped assignment and expiring hold atomically; duplicate retry is safe', async () => {
    const result = await submit()
    expect(result.capacityWarning).toContain('100')
    expect(result.assignedVenueStaffName).toBe(staff.name)
    expect(result.holdExpiresAt).toBe('2026-10-23T00:00:00.000Z')
    expect(values('venueAvailability')).toHaveLength(1)
    expect(db.store.get('event').assignedStaffUids).toEqual(['v1'])
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(await submit()).toEqual(result)
    expect(values(BOOKINGS)).toHaveLength(1)
    await expect(submit({ requirements: 'different' })).rejects.toMatchObject({ status: 409 })
    const transaction = db.transactions[0]
    expect(transaction.committed).toBe(true)
    expect(transaction.reads).toContain('systemLocks/venueStaffAssignment')
    expect(transaction.writes).toContain('systemLocks/venueBooking-hall')
  })
  it('assigns by load, rotates ties, and preserves the assignee on replacement', async () => {
    const first = await submit()
    const second = await submit({ venueId: 'room', submissionKey: 'second' })
    expect(second.assignedVenueStaffName).toBe(secondStaff.name)
    const third = await submit({ venueId: 'room', startsAt: '2027-03-02T10:00:00Z', endsAt: '2027-03-02T12:00:00Z', submissionKey: 'third' })
    expect(third.assignedVenueStaffName).toBe(staff.name)
    const replacement = await submit({ replacesId: first.id, submissionKey: 'replacement', startsAt: '2027-03-03T10:00:00Z', endsAt: '2027-03-03T12:00:00Z' })
    expect(replacement.assignedVenueStaffName).toBe(staff.name)
  })
  it('returns only assigned staff bookings and projects the event', async () => {
    await submit()
    expect((await listVenueBookingQueue(staff, db)).bookings).toHaveLength(1)
    expect((await listVenueBookingQueue(secondStaff, db)).bookings).toEqual([])
    const result = await listEventVenueBookings('event', staff, db)
    expect(result.event.internal).toBeUndefined()
    expect(result.event.equipment).toBeUndefined()
    expect(result.bookings[0].assignedVenueStaffUid).toBeUndefined()
    await expect(listEventVenueBookings('event', secondStaff, db)).rejects.toMatchObject({ status: 404 })
  })
  it('refuses missing staff, wrong actor, wrong scope and non-Planning without writes', async () => {
    await expect(submit({}, 'event', organiser)).rejects.toMatchObject({ status: 403 })
    await expect(submit({}, 'other')).rejects.toMatchObject({ status: 404 })
    db.store.get('event').status = CONFIRMED
    await expect(submit()).rejects.toMatchObject({ status: 409 })
    db.store.get('event').status = PLANNING
    db.collectionData('users').delete('v1'); db.collectionData('users').delete('v2')
    await expect(submit()).rejects.toThrow('No Venue Staff')
    expect(values(BOOKINGS)).toEqual([])
    expect(values('venueAvailability')).toEqual([])
    expect(values('systemLocks')).toEqual([])
  })
  it('refuses overlaps including buffers and permits exact occupied boundaries', async () => {
    await submit()
    await expect(submit({ submissionKey: 'overlap' })).rejects.toMatchObject({ name: 'VenueConflictError' })
    await expect(submit({ submissionKey: 'buffer', startsAt: '2027-03-01T13:14:59Z', endsAt: '2027-03-01T14:00:00Z' })).rejects.toMatchObject({ name: 'VenueConflictError' })
    await submit({ submissionKey: 'adjacent', startsAt: '2027-03-01T13:15:00Z', endsAt: '2027-03-01T14:00:00Z' })
    expect(values(BOOKINGS)).toHaveLength(2)
  })
  it('safely replaces same-venue times and releases the old venue on a move', async () => {
    const first = await submit()
    const second = await submit({ replacesId: first.id, submissionKey: 'revise', endsAt: '2027-03-01T13:00:00Z' })
    expect(values('venueAvailability').filter((v) => v.lifecycleStatus === 'active')).toHaveLength(1)
    const third = await submit({ replacesId: second.id, submissionKey: 'move', venueId: 'room' })
    expect(third.venueId).toBe('room')
    await submit({ submissionKey: 'hall-free' })
    await expect(submit({ replacesId: first.id, submissionKey: 'stale' })).rejects.toMatchObject({ status: 409 })
    expect(values(BOOKINGS).filter((v) => v.status === 'replaced')).toHaveLength(2)
  })
  it('failed replacement leaves the original request, hold and allocation unchanged', async () => {
    const first = await submit()
    await submit({ venueId: 'room', submissionKey: 'occupied' })
    const before = structuredClone([values(BOOKINGS), values('venueAvailability'), values('systemLocks')])
    await expect(submit({ replacesId: first.id, venueId: 'room', submissionKey: 'failed' })).rejects.toMatchObject({ name: 'VenueConflictError' })
    expect([values(BOOKINGS), values('venueAvailability'), values('systemLocks')]).toEqual(before)
  })
  it('ignores expired holds at the exact expiry boundary, but not legacy holds', async () => {
    const first = await submit()
    await submitVenueBooking('event', { ...input, submissionKey: 'after-expiry' }, coordinator, db, new Date(first.holdExpiresAt))
    const hold = values('venueAvailability')[0]
    delete hold.holdExpiresAt
    await expect(submit({ submissionKey: 'legacy' })).rejects.toMatchObject({ name: 'VenueConflictError' })
  })
  it.each([REJECT, CANCEL, APPROVE_CANCELLATION])('releases tentative holds on %s but preserves confirmed bookings', async (action) => {
    await submit()
    await db.collection('venueAvailability').doc('confirmed').set({ venueId: 'room', eventRequestId: 'event', status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, lifecycleStatus: 'active' })
    if (action !== REJECT) db.store.get('event').status = CONFIRMED
    if (action === APPROVE_CANCELLATION) await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    await transitionEventRequest('event', action, coordinator, db, now, { reason: 'Unable to proceed' })
    expect(values('venueAvailability')[0].lifecycleStatus).toBe('removed')
    expect(db.collectionData('venueAvailability').get('confirmed').lifecycleStatus).toBe('active')
    expect((await listVenueBookingQueue(staff, db)).bookings).toEqual([])
  })
  it('does not release a hold merely because cancellation was requested', async () => {
    await submit()
    db.store.get('event').status = CONFIRMED
    await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    expect(values('venueAvailability')[0].lifecycleStatus).toBe('active')
  })
  it('supports a rejected-booking fixture without inventing the approval workflow', async () => {
    const first = await submit()
    await rejectVenueBooking('event', first.id, { action: 'reject', reason: 'Unable to host' }, staff, db, now)
    const next = await submit({ replacesId: first.id, venueId: 'room', submissionKey: 'retry-rejected' })
    expect(next.assignedVenueStaffName).toBe(first.assignedVenueStaffName)
    expect(db.collectionData(BOOKINGS).get(first.id).status).toBe(BOOKING_REJECTED)
    expect(db.store.get('event').status).toBe(PLANNING)
  })
  it('rolls back booking, hold and assignment if a write fails before commit', async () => {
    const run = db.runTransaction.bind(db)
    db.runTransaction = (callback) => run((tx) => callback({ ...tx, set(ref, value) {
      if (ref.path.includes('/activity/')) throw new Error('Injected write failure')
      tx.set(ref, value)
    } }))
    await expect(submit()).rejects.toThrow('Injected write failure')
    expect(values(BOOKINGS)).toEqual([])
    expect(values('venueAvailability')).toEqual([])
    expect(values('systemLocks')).toEqual([])
    expect(db.store.get('event').assignedStaffUids).toEqual([])
  })
  it('rejects a cross-event replacement and a hold belonging to another event', async () => {
    const first = await submit()
    db.store.get('other').assignedCoordinatorUid = coordinator.uid
    await expect(submit({ replacesId: first.id, submissionKey: 'cross' }, 'other')).rejects.toMatchObject({ status: 404 })
    values('venueAvailability')[0].eventRequestId = 'other'
    await expect(submit({ replacesId: first.id, submissionKey: 'corrupt' })).rejects.toMatchObject({ status: 409 })
  })
})
