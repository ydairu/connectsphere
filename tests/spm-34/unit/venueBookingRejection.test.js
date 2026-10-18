import { describe, expect, it } from 'vitest'
import { canRejectVenueBooking, normaliseVenueBookingRejection } from '../../../shared/venueBooking.js'
import { venueBookingRejectedNotifications } from '../../../shared/notifications.js'
import { PLANNING, CONFIRMED } from '../../../shared/status.js'
import { staff, secondStaff, coordinator, organiser } from '../../spm-14/fixtures.js'

const event = { id: 'event', status: PLANNING, assignedCoordinatorUid: coordinator.uid, core: { title: 'Conference' } }
const booking = { id: 'booking', status: 'pending', assignedVenueStaffUid: staff.uid, venueName: 'Hall' }

describe('SPM-34 rejection rules', () => {
  it('requires a trimmed reason, permits a trimmed suggestion and refuses forged fields', () => {
    expect(normaliseVenueBookingRejection({ action: 'reject', reason: '  ', suggestedAlternative: '' }).errors.reason).toBeTruthy()
    expect(normaliseVenueBookingRejection({ action: 'reject', reason: '  No capacity  ', suggestedAlternative: '  Try Room  ' })).toEqual({
      value: { reason: 'No capacity', suggestedAlternative: 'Try Room' }, errors: {},
    })
    expect(normaliseVenueBookingRejection({ action: 'approve', reason: 'No', status: 'approved' }).errors).toHaveProperty('status')
    expect(normaliseVenueBookingRejection({ action: 'reject', reason: 'a'.repeat(4001) }).errors.reason).toBeTruthy()
    expect(normaliseVenueBookingRejection({ action: 'reject', reason: 'No', suggestedAlternative: 3 }).errors.suggestedAlternative).toBeTruthy()
  })
  it('allows only the assigned Venue Staff member on a pending booking in Planning', () => {
    expect(canRejectVenueBooking(staff, event, booking)).toBe(true)
    expect(canRejectVenueBooking(secondStaff, event, booking)).toBe(false)
    expect(canRejectVenueBooking(organiser, event, booking)).toBe(false)
    expect(canRejectVenueBooking(staff, { ...event, status: CONFIRMED }, booking)).toBe(false)
    expect(canRejectVenueBooking(staff, event, { ...booking, status: 'rejected' })).toBe(false)
  })
  it('addresses the current Coordinator with the reason and booking link data', () => {
    const notices = venueBookingRejectedNotifications(event, booking, staff, { reason: 'No capacity', at: '2026-10-18T00:00:00Z' })
    expect(notices).toEqual([expect.objectContaining({ recipientUid: coordinator.uid, bookingRequestId: booking.id,
      reason: 'No capacity', type: 'venue_booking_rejected', eventRequestId: event.id })])
    expect(venueBookingRejectedNotifications({ ...event, assignedCoordinatorUid: staff.uid }, booking, staff, { reason: 'No', at: 'now' })).toEqual([])
  })
})
