import { describe, expect, it } from 'vitest'
import { BOOKING_PENDING, BOOKING_APPROVED, canApproveVenueBooking, venueBookingApprovalErrors, venueBookingSuitability } from '../../../shared/venueBooking.js'
import { venueBookingApprovedNotifications } from '../../../shared/notifications.js'
import { PLANNING, CONFIRMED, CANCELLED, COMPLETED, REJECTED, DRAFT } from '../../../shared/status.js'
import { COORDINATOR, VENUE_STAFF } from '../../../shared/permissions.js'
import { coordinator, staff, secondStaff, organiser, fixture, input } from '../fixtures.js'

const event = { id: 'event', status: PLANNING, assignedCoordinatorUid: coordinator.uid, core: { title: 'Conference' } }
const booking = { ...input, id: 'booking', status: BOOKING_PENDING, assignedVenueStaffUid: staff.uid, venueName: 'Hall' }

describe('SPM-54 approval rules', () => {
  it('allows only the assigned Venue Staff role, including a multi-role account', () => {
    expect(canApproveVenueBooking(staff, event, booking)).toBe(true)
    expect(canApproveVenueBooking({ ...staff, roles: [COORDINATOR, VENUE_STAFF] }, event, booking)).toBe(true)
    for (const actor of [secondStaff, organiser, coordinator]) expect(canApproveVenueBooking(actor, event, booking)).toBe(false)
    for (const status of [CONFIRMED, CANCELLED, COMPLETED, REJECTED, DRAFT]) expect(canApproveVenueBooking(staff, { ...event, status }, booking)).toBe(false)
    for (const status of [BOOKING_APPROVED, 'rejected', 'cancelled', 'replaced']) expect(canApproveVenueBooking(staff, event, { ...booking, status })).toBe(false)
  })
  it('accepts only the approval action, never supplied status, ownership or assignee', () => {
    expect(venueBookingApprovalErrors({ action: 'approve' })).toEqual({})
    for (const value of [null, [], 'approve', {}, { action: 'reject' }]) expect(Object.keys(venueBookingApprovalErrors(value)).length).toBeGreaterThan(0)
    expect(venueBookingApprovalErrors({ action: 'approve', status: 'approved', ownerUid: 'x', assignedVenueStaffUid: 'x' })).toEqual({
      status: expect.any(String), ownerUid: expect.any(String), assignedVenueStaffUid: expect.any(String),
    })
  })
  it('uses current attendance and required facilities and preserves warning-only rules', () => {
    const db = fixture(), current = db.store.get('event'), venue = db.collectionData('venues').get('hall')
    current.core.expectedAttendees = 201
    current.venue.requiredFacilities = ['Stage']
    expect(venueBookingSuitability(current, booking, venue).problems.map((p) => p.check)).toEqual(['capacity', 'facilities'])
    current.core.expectedAttendees = 200
    current.venue.requiredFacilities = ['Projector']
    current.venue.layoutPreference = 'Banquet'
    current.venue.requiredAccessibilityFeatures = ['Lift']
    const result = venueBookingSuitability(current, booking, venue)
    expect(result.problems).toEqual([])
    expect(result.warnings.map((w) => w.check)).toEqual(['layout', 'accessibility'])
  })
  it('checks operating hours against the booking interval rather than the overall event', () => {
    const db = fixture(), current = db.store.get('event'), venue = db.collectionData('venues').get('hall')
    venue.operatingHours = '09:00-18:00'
    current.core.preferredDateTime = '2027-03-01T02:00:00Z'
    const result = venueBookingSuitability(current, booking, venue)
    expect(result.warnings.some((w) => w.check === 'operatingHours')).toBe(true)
  })
  it('addresses the current Coordinator with a booking link, following self-notification rules', () => {
    expect(venueBookingApprovedNotifications(event, booking, staff, { at: 'now' })).toEqual([
      expect.objectContaining({ type: 'venue_booking_approved', recipientUid: coordinator.uid, bookingRequestId: booking.id, eventRequestId: event.id }),
    ])
    expect(venueBookingApprovedNotifications({ ...event, assignedCoordinatorUid: staff.uid }, booking, staff, { at: 'now' })).toEqual([])
  })
})
