import { describe, expect, it } from 'vitest'
import { currentVenueBookingGroups, venueBookingNextStep, venueBookingStatusLabel } from '../../shared/venueBooking.js'
import { findVenueConflict } from '../../shared/venueConflicts.js'
import { CANCELLED, PLANNING } from '../../shared/status.js'

describe('SPM-77 venue booking overview', () => {
  it('groups replacement history under the same venue need, including legacy records', () => {
    const bookings = [
      { id: 'hall-old', venueName: 'Hall', status: 'cancelled', createdAt: '2027-01-01', startsAt: '2027-03-01T10:00:00Z' },
      { id: 'room', venueNeedId: 'room', venueName: 'Room', status: 'approved', createdAt: '2027-01-02' },
      { id: 'hall-new', replacesId: 'hall-old', venueName: 'Studio', status: 'pending', createdAt: '2027-01-03' },
    ]
    const groups = currentVenueBookingGroups(bookings)
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.venueNeedId === 'hall-old')).toMatchObject({
      current: { id: 'hall-new' }, history: [{ id: 'hall-old' }],
    })
    expect(groups.find((group) => group.venueNeedId === 'room')).toMatchObject({ current: { id: 'room' }, history: [] })
  })

  it('explains the next step for every booking outcome and a closed event', () => {
    for (const [status, label, next] of [
      ['pending', 'Under review', 'Await Venue Staff review.'],
      ['approved', 'Approved', 'Venue booked; no booking action needed.'],
      ['rejected', 'Rejected', 'The Coordinator will request a replacement venue.'],
      ['expired', 'Expired', 'The Coordinator will submit a new request for this venue need.'],
      ['cancelled', 'Cancelled', 'The Coordinator will arrange a replacement if the event continues.'],
      ['replaced', 'Replaced', 'See the current request for this venue need.'],
    ]) {
      expect(venueBookingStatusLabel(status)).toBe(label)
      expect(venueBookingNextStep({ status }, PLANNING)).toBe(next)
    }
    expect(venueBookingNextStep({ status: 'cancelled' }, CANCELLED)).toContain('no replacement')
  })

  it('checks each venue and its occupied period independently', () => {
    const candidate = { venueId: 'room', startsAt: '2027-03-01T12:30:00Z', endsAt: '2027-03-01T13:30:00Z' }
    const commitments = [{ id: 'hall-booking', venueId: 'hall', status: 'confirmed_booking', lifecycleStatus: 'active',
      startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z' }]
    const venue = { setupMinutes: 0, turnaroundMinutes: 45 }
    expect(findVenueConflict({ candidate, venue, commitments })).toBeNull()
    commitments.push({ ...commitments[0], id: 'room-booking', venueId: 'room' })
    expect(findVenueConflict({ candidate, venue, commitments })?.id).toBe('room-booking')
  })
})
