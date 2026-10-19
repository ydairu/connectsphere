import { beforeEach, describe, expect, it } from 'vitest'
import { approveVenueBooking, listEventVenueBookings, listVenueBookingQueue, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { processVenueHolds, HOLD_WARNING_LEAD_MS } from '../../backend/src/services/venueHoldExpiryService.js'
import { backfillVenueHoldExpiries } from '../../backend/src/services/venueHoldBackfillService.js'
import { buildVenueCalendar } from '../../shared/venueCalendar.js'
import { AVAILABILITY_STATUS, TENTATIVE_HOLD_DURATION_MS } from '../../shared/venueAvailability.js'
import { findVenueConflict } from '../../shared/venueConflicts.js'
import { BOOKING_EXPIRED, chooseVenueStaff, pendingVenueBookings } from '../../shared/venueBooking.js'
import { VENUE_HOLD_EXPIRED_NOTICE, VENUE_HOLD_WARNING_NOTICE } from '../../shared/notifications.js'
import { PLANNING } from '../../shared/status.js'
import { coordinator, fixture, input, now, staff } from '../spm-14/fixtures.js'

const later = (ms) => new Date(now.getTime() + ms)
let db
beforeEach(() => { db = fixture() })
const submit = (overrides = {}) => submitVenueBooking('event', { ...input, ...overrides }, coordinator, db, now)
const data = (path) => [...db.collectionData(path).values()]
const saved = (id) => db.collectionData('venueBookingRequests').get(id)
const holdOf = (id) => db.collectionData('venueAvailability').get(saved(id).holdId)

describe('SPM-78 hold deadlines and notifications', () => {
  it('warns once at 24 hours, then expires only that hold at seven days', async () => {
    const first = await submit()
    const second = await submit({ venueId: 'room', submissionKey: 'second' })
    const secondBefore = structuredClone([saved(second.id), holdOf(second.id)])
    expect(new Date(first.holdExpiresAt).getTime() - now.getTime()).toBe(TENTATIVE_HOLD_DURATION_MS)
    expect(HOLD_WARNING_LEAD_MS).toBe(24 * 60 * 60 * 1000)
    expect((await processVenueHolds(db, later(TENTATIVE_HOLD_DURATION_MS - HOLD_WARNING_LEAD_MS - 1))).warned).toBe(0)
    const warningTime = later(TENTATIVE_HOLD_DURATION_MS - HOLD_WARNING_LEAD_MS)
    // Both holds are due at the same time; each gets its own notice.
    expect((await processVenueHolds(db, warningTime)).warned).toBe(2)
    expect((await processVenueHolds(db, warningTime)).warned).toBe(0)
    expect(data('notifications').filter((notice) => notice.type === VENUE_HOLD_WARNING_NOTICE)).toHaveLength(2)
    await approveVenueBooking('event', second.id, { action: 'approve' }, db.collectionData('users').get(saved(second.id).assignedVenueStaffUid), db, later(TENTATIVE_HOLD_DURATION_MS - 1))
    const deadline = later(TENTATIVE_HOLD_DURATION_MS)
    expect((await processVenueHolds(db, deadline)).expired).toBe(1)
    expect((await processVenueHolds(db, deadline)).expired).toBe(0)
    expect(saved(first.id).status).toBe(BOOKING_EXPIRED)
    expect(holdOf(first.id)).toMatchObject({ lifecycleStatus: 'removed', removalReason: 'expired' })
    expect(saved(second.id).status).toBe('approved')
    expect(holdOf(second.id).status).toBe(AVAILABILITY_STATUS.CONFIRMED_BOOKING)
    expect(secondBefore[0].holdId).toBe(saved(second.id).holdId)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(data('notifications').filter((notice) => notice.type === VENUE_HOLD_EXPIRED_NOTICE)).toHaveLength(1)
    expect(data('eventRequests/event/activity').filter((entry) => entry.type === 'venue_hold_expired')).toHaveLength(1)
    expect((await listEventVenueBookings('event', coordinator, db, deadline)).bookings.find((b) => b.id === first.id).status).toBe(BOOKING_EXPIRED)
    expect((await listVenueBookingQueue(staff, db, deadline)).bookings).toEqual([])
  })

  it('uses the current Coordinator and sends only expiry if the hourly check missed the warning', async () => {
    const booking = await submit()
    db.store.get('event').assignedCoordinatorUid = 'new-coordinator'
    const outcome = await processVenueHolds(db, new Date(booking.holdExpiresAt))
    expect(outcome).toMatchObject({ warned: 0, expired: 1 })
    expect(data('notifications')).toEqual([expect.objectContaining({ recipientUid: 'new-coordinator', type: VENUE_HOLD_EXPIRED_NOTICE })])
  })

  it('reports a booking with no Coordinator for review instead of silently losing its notice', async () => {
    const booking = await submit()
    db.store.get('event').assignedCoordinatorUid = null
    const result = await processVenueHolds(db, new Date(booking.holdExpiresAt))
    expect(result.review).toEqual([saved(booking.id).holdId])
    expect(data('notifications')).toEqual([])
    expect(saved(booking.id).status).toBe('pending')
  })

  it('does not warn or expire a hold approved before its deadline', async () => {
    const booking = await submit({ venueId: 'room' })
    const assignee = db.collectionData('users').get(saved(booking.id).assignedVenueStaffUid)
    await approveVenueBooking('event', booking.id, { action: 'approve' }, assignee, db, later(TENTATIVE_HOLD_DURATION_MS - 1))
    await processVenueHolds(db, later(TENTATIVE_HOLD_DURATION_MS + 60 * 60 * 1000))
    expect(saved(booking.id).status).toBe('approved')
    expect(data('notifications').filter((notice) => [VENUE_HOLD_WARNING_NOTICE, VENUE_HOLD_EXPIRED_NOTICE].includes(notice.type))).toEqual([])
  })

  it('treats the exact deadline as expired before the background task runs', async () => {
    const booking = await submit({ venueId: 'room' })
    const deadline = new Date(booking.holdExpiresAt)
    const assignee = db.collectionData('users').get(saved(booking.id).assignedVenueStaffUid)
    await expect(approveVenueBooking('event', booking.id, { action: 'approve' }, assignee, db, deadline)).rejects.toMatchObject({ status: 409 })
    expect((await listVenueBookingQueue(assignee, db, deadline)).bookings).toEqual([])
    expect(pendingVenueBookings([{ ...saved(booking.id), id: booking.id }], deadline)).toEqual([])
    expect((await listEventVenueBookings('event', coordinator, db, deadline)).bookings[0].status).toBe(BOOKING_EXPIRED)
    const range = { from: new Date('2027-03-01T09:00:00Z'), to: new Date('2027-03-01T13:00:00Z') }
    const calendar = buildVenueCalendar([{ ...holdOf(booking.id), id: saved(booking.id).holdId }], range, db.collectionData('venues').get('room'), deadline)
    expect(calendar.slots).toEqual([{ status: AVAILABILITY_STATUS.AVAILABLE, startsAt: range.from.toISOString(), endsAt: range.to.toISOString() }])
    expect(findVenueConflict({ candidate: { ...input, venueId: 'room' }, venue: db.collectionData('venues').get('room'), commitments: [holdOf(booking.id)], now: deadline })).toBeNull()
  })

  it('does not count an expired pending request as Venue Staff workload', () => {
    const users = data('users')
    const bookings = [{ assignedVenueStaffUid: staff.uid, status: 'pending', holdExpiresAt: now.toISOString() }]
    expect(chooseVenueStaff(users, bookings, null, now).uid).toBe(staff.uid)
  })

  it.each([false, true])('lets the Coordinator replace an expired hold after the task has run: %s', async (processed) => {
    const first = await submit()
    const deadline = new Date(first.holdExpiresAt)
    if (processed) await processVenueHolds(db, deadline)
    const replacement = await submitVenueBooking('event', { ...input, replacesId: first.id, submissionKey: 'replacement' }, coordinator, db, deadline)
    expect(replacement.status).toBe('pending')
    expect(saved(first.id)).toMatchObject({ status: BOOKING_EXPIRED, replacedById: replacement.id })
    expect(holdOf(first.id).lifecycleStatus).toBe('removed')
    expect(holdOf(replacement.id).lifecycleStatus).toBe('active')
  })
})

describe('SPM-78 legacy hold backfill', () => {
  it('dry-runs, writes only missing deadlines, and reports unresolvable records', async () => {
    const booking = await submit()
    delete holdOf(booking.id).holdExpiresAt
    delete saved(booking.id).holdExpiresAt
    db.collectionData('venueAvailability').set('unknown', { venueId: 'room', status: AVAILABILITY_STATUS.TENTATIVE_HOLD, lifecycleStatus: 'active' })
    const dry = await backfillVenueHoldExpiries(db)
    expect(dry.planned).toEqual([expect.objectContaining({ holdId: saved(booking.id).holdId, holdExpiresAt: later(TENTATIVE_HOLD_DURATION_MS).toISOString() })])
    expect(dry.review).toEqual([expect.objectContaining({ holdId: 'unknown' })])
    expect(holdOf(booking.id).holdExpiresAt).toBeUndefined()
    const write = await backfillVenueHoldExpiries(db, { write: true })
    expect(write.updated).toEqual([saved(booking.id).holdId])
    expect(saved(booking.id).holdExpiresAt).toBe(later(TENTATIVE_HOLD_DURATION_MS).toISOString())
    expect((await backfillVenueHoldExpiries(db, { write: true })).updated).toEqual([])
  })
})
