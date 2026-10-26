import { beforeEach, describe, expect, it } from 'vitest'
import { approveVenueBooking, BOOKINGS, listEventVenueBookings, listVenueBookingQueue, rejectVenueBooking, submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { listVenueAvailability, listVenues, updateVenue } from '../../../backend/src/services/venueService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { AVAILABILITY_STATUS as A } from '../../../shared/venueAvailability.js'
import { APPROVE_CANCELLATION, CANCEL, REJECT } from '../../../shared/statusTransitions.js'
import { REQUEST_CANCELLATION, REFUSE_CANCELLATION, RETURN_CANCELLATION } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { coordinator, fixture, input, now, organiser, secondStaff, staff } from '../fixtures.js'

let db
beforeEach(() => { db = fixture() })
const submit = (changes = {}) => submitVenueBooking('event', { ...input, ...changes }, coordinator, db, now)
const approve = (id, at = now) => approveVenueBooking('event', id, { action: 'approve' }, staff, db, at)
const values = (name) => [...db.collectionData(name).values()]
const stored = (id) => db.collectionData(BOOKINGS).get(id)
const hold = (id) => db.collectionData('venueAvailability').get(stored(id).holdId)
const snapshot = () => structuredClone([values(BOOKINGS), values('venueAvailability'), values('notifications'), values('systemLocks'), values('eventRequests/event/activity'), db.store.get('event')])

describe('SPM-54 atomic approval with in-memory persistence', () => {
  it('converts only the linked hold, preserves Planning and other bookings, and notifies once', async () => {
    const first = await submit()
    const second = await submit({ venueId: 'room', submissionKey: 'second' })
    const otherBefore = structuredClone([stored(second.id), hold(second.id)])
    const holdId = stored(first.id).holdId
    const result = await approve(first.id)
    expect(result).toMatchObject({ status: 'approved', approvedAt: now.toISOString(), canApprove: false, canReject: false, holdExpiresAt: null })
    expect(stored(first.id)).toMatchObject({ approvedByUid: staff.uid, holdId })
    expect(hold(first.id)).toMatchObject({ status: A.CONFIRMED_BOOKING, lifecycleStatus: 'active', bookingRequestId: first.id, holdExpiresAt: null })
    expect([stored(second.id), hold(second.id)]).toEqual(otherBefore)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(db.store.get('event').arrangementApprovals).toBeUndefined()
    expect((await listVenueBookingQueue(staff, db, now)).bookings).toEqual([])
    expect((await listVenueBookingQueue(secondStaff, db, now)).bookings).toHaveLength(1)
    expect((await listEventVenueBookings('event', coordinator, db, now)).bookings.find((b) => b.id === first.id).status).toBe('approved')
    expect(values('notifications')).toEqual([expect.objectContaining({ recipientUid: coordinator.uid, bookingRequestId: first.id })])
    expect(values('eventRequests/event/activity').filter((a) => a.type === 'venue_booking_approved')).toHaveLength(1)
    expect(db.transactions.at(-1).writes).toEqual(expect.arrayContaining(['eventRequests/event', 'systemLocks/venueBooking-hall', 'systemLocks/venueStaffAssignment']))
  })
  it('uses the current Coordinator after reassignment', async () => {
    const booking = await submit()
    db.store.get('event').assignedCoordinatorUid = 'new-coordinator'
    await approve(booking.id)
    expect(values('notifications')[0].recipientUid).toBe('new-coordinator')
  })
  it('updates calendar and search, blocks overlapping requests and locks venue buffer edits', async () => {
    const booking = await submit()
    await approve(booking.id)
    const calendar = await listVenueAvailability('hall', { from: '2027-03-01T08:00:00Z', to: '2027-03-01T15:00:00Z' }, db)
    expect(calendar.slots.some((s) => s.status === A.CONFIRMED_BOOKING)).toBe(true)
    expect(calendar.slots.some((s) => s.status === A.TENTATIVE_HOLD)).toBe(false)
    expect(calendar.slots.filter((s) => ['setup', 'turnaround'].includes(s.status))).toHaveLength(2)
    expect((await listVenues({ availableFrom: input.startsAt, availableTo: input.endsAt }, db, now)).venues.map((v) => v.id)).not.toContain('hall')
    await expect(submit({ submissionKey: 'overlap' })).rejects.toMatchObject({ name: 'VenueConflictError' })
    await expect(updateVenue('hall', { ...db.collectionData('venues').get('hall'), setupMinutes: 60,
      location: 'Level 1', accessibilityFeatures: ['Lift'], operatingHours: 'Always open',
    }, staff, db, now)).rejects.toMatchObject({ name: 'VenueBufferTimesLockedError' })
  })
  it.each(['capacity', 'facilities'])('rejects a fresh %s failure without any writes', async (kind) => {
    const booking = await submit()
    if (kind === 'capacity') db.collectionData('venues').get('hall').maximumCapacity = 39
    else db.store.get('event').venue.requiredFacilities = ['Missing stage']
    const before = snapshot()
    await expect(approve(booking.id)).rejects.toMatchObject({ status: 409 })
    expect(snapshot()).toEqual(before)
  })
  it('allows warning-only suitability and saves the warnings', async () => {
    const booking = await submit({ requirements: 'Banquet' })
    db.store.get('event').venue.layoutPreference = 'Theatre'
    expect((await approve(booking.id)).approvalWarnings).toEqual([expect.objectContaining({ check: 'layout' })])
  })
  it.each([A.CONFIRMED_BOOKING, A.TENTATIVE_HOLD, A.MAINTENANCE_BLOCK])('refuses a fresh %s conflict, even one linked to the same event', async (status) => {
    const booking = await submit()
    db.collectionData('venueAvailability').set('conflict', { ...hold(booking.id), bookingRequestId: 'different', status, holdExpiresAt: '2028-01-01T00:00:00Z' })
    const before = snapshot()
    await expect(approve(booking.id)).rejects.toMatchObject({ name: 'VenueConflictError' })
    expect(snapshot()).toEqual(before)
  })
  it.each([['13:15:00', true], ['13:14:59', false]])('checks occupied boundaries at %s', async (start, allowed) => {
    const booking = await submit()
    db.collectionData('venueAvailability').set('adjacent', { venueId: 'hall', status: A.CONFIRMED_BOOKING,
      startsAt: `2027-03-01T${start}Z`, endsAt: '2027-03-01T15:00:00Z', lifecycleStatus: 'active' })
    if (allowed) expect((await approve(booking.id)).status).toBe('approved')
    else await expect(approve(booking.id)).rejects.toMatchObject({ name: 'VenueConflictError' })
  })
  it('refuses approval at the exact expiry time', async () => {
    const booking = await submit()
    db.collectionData('venueAvailability').set('expired', { ...hold(booking.id), bookingRequestId: 'other' })
    await expect(approve(booking.id, new Date(booking.holdExpiresAt))).rejects.toMatchObject({ status: 409 })
  })
  it('refuses an expired own hold even when another request has acquired the period', async () => {
    const booking = await submit()
    const after = new Date(booking.holdExpiresAt)
    await submitVenueBooking('event', { ...input, submissionKey: 'new-hold' }, coordinator, db, after)
    await expect(approve(booking.id, after)).rejects.toMatchObject({ status: 409 })
  })
  it.each(['missing', 'removed', 'event', 'booking', 'venue', 'time'])('refuses a %s hold without writing', async (kind) => {
    const booking = await submit(), commitment = hold(booking.id)
    if (kind === 'missing') db.collectionData('venueAvailability').delete(stored(booking.id).holdId)
    if (kind === 'removed') commitment.lifecycleStatus = 'removed'
    if (kind === 'event') commitment.eventRequestId = 'other'
    if (kind === 'booking') commitment.bookingRequestId = 'other'
    if (kind === 'venue') commitment.venueId = 'room'
    if (kind === 'time') commitment.endsAt = '2027-03-01T13:00:00Z'
    const before = snapshot()
    await expect(approve(booking.id)).rejects.toMatchObject({ status: 409 })
    expect(snapshot()).toEqual(before)
  })
  it('refuses repeated approval and rejection after approval without extra activity or notices', async () => {
    const booking = await submit()
    await approve(booking.id)
    const before = snapshot()
    await expect(approve(booking.id)).rejects.toMatchObject({ status: 409 })
    await expect(rejectVenueBooking('event', booking.id, { action: 'reject', reason: 'No' }, staff, db, now)).rejects.toMatchObject({ status: 409 })
    expect(snapshot()).toEqual(before)
  })
  it.each(['activity', 'notifications'])('rolls back everything on a %s write failure', async (collection) => {
    const booking = await submit(), before = snapshot(), run = db.runTransaction.bind(db)
    db.runTransaction = (callback) => run((tx) => callback({ ...tx, set(ref, value) {
      if (ref.path.includes(collection)) throw new Error('Injected failure')
      tx.set(ref, value)
    } }))
    await expect(approve(booking.id)).rejects.toThrow('Injected failure')
    expect(snapshot()).toEqual(before)
  })
  it.each([REJECT, CANCEL, APPROVE_CANCELLATION])('releases all event reservations on %s and preserves another event', async (action) => {
    const first = await submit()
    await approve(first.id)
    const second = await submit({ venueId: 'room', submissionKey: 'second' })
    const secondActor = db.collectionData('users').get(stored(second.id).assignedVenueStaffUid)
    await approveVenueBooking('event', second.id, { action: 'approve' }, secondActor, db, now)
    db.collectionData('venueAvailability').set('unrelated', { ...hold(first.id), eventRequestId: 'other' })
    if (action !== REJECT) db.store.get('event').status = CONFIRMED
    if (action === APPROVE_CANCELLATION) await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    await transitionEventRequest('event', action, coordinator, db, now, { reason: 'Cannot proceed' })
    for (const booking of [first, second]) {
      expect(hold(booking.id).lifecycleStatus).toBe('removed')
      expect(stored(booking.id)).toMatchObject({ status: 'cancelled', approvedAt: now.toISOString() })
    }
    expect(db.collectionData('venueAvailability').get('unrelated').lifecycleStatus).toBe('active')
  })
  it.each([null, RETURN_CANCELLATION, REFUSE_CANCELLATION])('preserves approval while cancellation is requested or %s', async (action) => {
    const booking = await submit()
    await approve(booking.id)
    db.store.get('event').status = CONFIRMED
    await transitionEventRequest('event', REQUEST_CANCELLATION, organiser, db, now, { reason: 'Cancel please' })
    if (action) await transitionEventRequest('event', action, coordinator, db, now, { reason: 'Please reconsider' })
    expect(hold(booking.id).lifecycleStatus).toBe('active')
    expect(stored(booking.id).status).toBe('approved')
  })
})

 it('previews submitted requirements without writes and rechecks current capacity after preview', async () => {
   const booking = await submit({ requirements: 'Breakout Room' })
   db.store.get('event').venue.layoutPreference = 'Breakkout Room'
   const before = snapshot()
   const preview = await listEventVenueBookings('event', staff, db, now)
   expect(preview.bookings[0].suitability.warnings[0].message).toContain('Breakout Room')
   expect(snapshot()).toEqual(before)
   db.store.get('event').venue.layoutPreference = 'Breakout Room'
   expect((await listEventVenueBookings('event', staff, db, now)).bookings[0].suitability.warnings[0].message).toContain('"Breakout Room"')
   await expect(listEventVenueBookings('event', secondStaff, db, now)).rejects.toMatchObject({ status: 404 })
   db.collectionData('venues').get('hall').maximumCapacity = 39
   const changed = snapshot()
   await expect(approve(booking.id)).rejects.toMatchObject({ status: 409 })
   expect(snapshot()).toEqual(changed)
   db.collectionData('venues').get('hall').maximumCapacity = 50
   expect((await approve(booking.id)).approvalWarnings[0].message).toContain('"Breakout Room"')
 })

 it('uses reviewed replacement text for preview and approval without rewriting event or rejected history', async () => {
   db.store.get('event').venue.layoutPreference = 'Breakkout Room'
   db.collectionData('venues').get('hall').supportedLayouts = ['Classroom']
   const original = await submit({ requirements: 'Breakkout Room' })
   await rejectVenueBooking('event', original.id, { action: 'reject', reason: 'Revise layout' }, staff, db, now)
   const replacement = await submit({ requirements: 'classroom', replacesId: original.id, submissionKey: 'classroom-replacement' })
   const preview = (await listEventVenueBookings('event', staff, db, now)).bookings.find((b) => b.id === replacement.id)
   expect(preview.suitability.warnings).toEqual([])
   expect((await approve(replacement.id)).approvalWarnings).toEqual([])
   expect(stored(original.id)).toMatchObject({ status: 'rejected', requirements: 'Breakkout Room', rejectionReason: 'Revise layout' })
   expect(db.store.get('event').venue.layoutPreference).toBe('Breakkout Room')
 })
