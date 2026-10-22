import { beforeEach, describe, expect, it } from 'vitest'
import { approveVenueBooking, cancelVenueBooking, listEventVenueBookings, rejectVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { listVenues } from '../../backend/src/services/venueService.js'
import { transitionEventRequest } from '../../backend/src/services/statusTransitionService.js'
import { canCancelVenueBooking, venueBookingCancellationErrors, venueBookingReadiness } from '../../shared/venueBooking.js'
import { CONFIRM } from '../../shared/statusTransitions.js'
import { CONFIRMED, PLANNING } from '../../shared/status.js'
import { coordinator, fixture, input, now, organiser, staff } from '../spm-14/fixtures.js'

let db
beforeEach(() => {
  db = fixture()
  db.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
})
const bookings = () => db.collectionData('venueBookingRequests')
const readiness = () => venueBookingReadiness([...bookings()].map(([id, booking]) => ({ id, ...booking })))
const availability = () => db.collectionData('venueAvailability')
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
const hold = (id) => availability().get(bookings().get(id).holdId)
const submit = (changes = {}) => submitVenueBooking('event', { ...input, ...changes }, coordinator, db, now)
const decide = (booking) => db.collectionData('users').get(bookings().get(booking.id).assignedVenueStaffUid)
const approve = (booking) => approveVenueBooking('event', booking.id, { action: 'approve' }, decide(booking), db, now)
const cancel = (booking, actor = coordinator) => cancelVenueBooking('event', booking.id, { action: 'cancel' }, actor, db, now)
const pair = async () => [await submit(), await submit({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })]

describe('SPM-81 independent venue decisions', () => {
  it('approves one booking and rejects another without changing sibling records', async () => {
    const [hall, room] = await pair()
    const roomBefore = structuredClone([bookings().get(room.id), hold(room.id)])
    await approve(hall)
    expect([bookings().get(room.id), hold(room.id)]).toEqual(roomBefore)
    const hallBefore = structuredClone([bookings().get(hall.id), hold(hall.id)])
    await rejectVenueBooking('event', room.id, { action: 'reject', reason: 'Unsuitable room' }, decide(room), db, now)
    expect([bookings().get(hall.id), hold(hall.id)]).toEqual(hallBefore)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(readiness().ready).toBe(false)
  })

  it('cancels only one approved reservation and allows a replacement for the same need', async () => {
    const [hall, room] = await pair()
    await approve(hall)
    await approve(room)
    const roomBefore = structuredClone([bookings().get(room.id), hold(room.id)])
    expect((await listEventVenueBookings('event', coordinator, db, now)).bookings.find((b) => b.id === hall.id).canCancel).toBe(true)
    const result = await cancel(hall)
    expect(result).toMatchObject({ status: 'cancelled', cancelledAt: now.toISOString(), canCancel: false })
    expect(hold(hall.id)).toMatchObject({ status: 'confirmed_booking', lifecycleStatus: 'removed' })
    expect([bookings().get(room.id), hold(room.id)]).toEqual(roomBefore)
    expect(readiness()).toMatchObject({ ready: false, total: 2, approved: 1 })
    await expect(transitionEventRequest('event', CONFIRM, coordinator, db, now)).rejects.toMatchObject({ reason: 'arrangements_not_approved' })
    expect((await listVenues({ availableFrom: input.startsAt, availableTo: input.endsAt }, db, now)).venues.map((v) => v.id)).toContain('hall')
    const replacement = await submit({ replacesId: hall.id, submissionKey: 'hall-replacement' })
    expect(replacement.venueNeedId).toBe(hall.venueNeedId)
    expect(bookings().get(hall.id)).toMatchObject({ status: 'cancelled', replacedById: replacement.id })
    await approve(replacement)
    expect(readiness()).toMatchObject({ ready: true, total: 2, approved: 2 })
    expect((await transitionEventRequest('event', CONFIRM, coordinator, db, now)).status).toBe(CONFIRMED)
  })

  it('moves a Confirmed event back to Planning with status history and keeps the other booking', async () => {
    const [hall, room] = await pair()
    await approve(hall)
    await approve(room)
    await transitionEventRequest('event', CONFIRM, coordinator, db, now)
    db.store.get('event').arrangementApprovals = { venue: { decision: 'approved' }, technical: { decision: 'approved' } }
    const roomBefore = structuredClone([bookings().get(room.id), hold(room.id)])
    await cancel(hall)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(db.store.get('event').arrangementApprovals).toEqual({ technical: { decision: 'approved' } })
    expect([bookings().get(room.id), hold(room.id)]).toEqual(roomBefore)
    expect(activity()).toContainEqual(expect.objectContaining({ type: 'status_changed', action: 'venue_booking_cancelled',
      fromStatus: CONFIRMED, toStatus: PLANNING, actor: expect.objectContaining({ uid: coordinator.uid }) }))
    expect(activity()).toContainEqual(expect.objectContaining({ type: 'venue_booking_cancelled', bookingRequestId: hall.id }))
  })

  it('rejects unauthorised, stale and inconsistent cancellations without writes', async () => {
    const hall = await submit()
    await approve(hall)
    const snapshot = () => structuredClone([bookings().get(hall.id), hold(hall.id), db.store.get('event'), activity()])
    const before = snapshot()
    await expect(cancel(hall, staff)).rejects.toMatchObject({ status: 403 })
    await expect(cancel(hall, organiser)).rejects.toMatchObject({ status: 403 })
    await expect(cancel(hall, { ...coordinator, uid: 'other-c' })).rejects.toMatchObject({ status: 404 })
    db.store.get('event').cancellationRequest = { status: 'pending' }
    expect(canCancelVenueBooking(coordinator, db.store.get('event'), bookings().get(hall.id), now)).toBe(false)
    await expect(cancel(hall)).rejects.toMatchObject({ status: 409 })
    delete db.store.get('event').cancellationRequest
    expect(snapshot()).toEqual(before)
    hold(hall.id).bookingRequestId = 'another'
    const changed = snapshot()
    await expect(cancel(hall)).rejects.toMatchObject({ status: 409 })
    expect(snapshot()).toEqual(changed)
    hold(hall.id).bookingRequestId = hall.id
    await cancel(hall)
    await expect(cancel(hall)).rejects.toMatchObject({ status: 409 })
  })

  it('rejects extra cancellation fields and an event that has started', async () => {
    expect(venueBookingCancellationErrors({ action: 'cancel', status: 'cancelled' }).status).toBeTruthy()
    const hall = await submit()
    await approve(hall)
    db.store.get('event').core.preferredDateTime = '2026-01-01T00:00:00Z'
    await expect(cancel(hall)).rejects.toMatchObject({ status: 409 })
    expect(hold(hall.id).lifecycleStatus).toBe('active')
  })

  it('refuses an approved booking with a missing reservation reference', async () => {
    const hall = await submit()
    await approve(hall)
    const holdId = bookings().get(hall.id).holdId
    const commitment = structuredClone(hold(hall.id))
    delete bookings().get(hall.id).holdId
    await expect(cancel(hall)).rejects.toMatchObject({ status: 409 })
    expect(availability().get(holdId)).toEqual(commitment)
  })

  it('uses only the selected venue occupied period when deciding siblings', async () => {
    const [hall, room] = await pair()
    availability().set('adjacent', { venueId: 'hall', status: 'confirmed_booking', lifecycleStatus: 'active',
      startsAt: '2027-03-01T13:14:59Z', endsAt: '2027-03-01T15:00:00Z' })
    await expect(approve(hall)).rejects.toMatchObject({ name: 'VenueConflictError' })
    expect((await approve(room)).status).toBe('approved')
    availability().get('adjacent').startsAt = '2027-03-01T13:15:00Z'
    expect((await approve(hall)).status).toBe('approved')
  })

  it('rolls back the booking and reservation when cancellation history cannot be written', async () => {
    const hall = await submit()
    await approve(hall)
    const before = structuredClone([bookings().get(hall.id), hold(hall.id), db.store.get('event')])
    const run = db.runTransaction.bind(db)
    db.runTransaction = (callback) => run((tx) => callback({ ...tx, set(ref, value) {
      if (ref.path.includes('/activity/')) throw new Error('Injected history failure')
      tx.set(ref, value)
    } }))
    await expect(cancel(hall)).rejects.toThrow('Injected history failure')
    expect([bookings().get(hall.id), hold(hall.id), db.store.get('event')]).toEqual(before)
  })
})
