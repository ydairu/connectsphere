import { describe, expect, it } from 'vitest'
import { BOOKING_PENDING, canReadVenueBooking, canRequestVenue, capacityWarning, chooseVenueStaff, normaliseVenueBooking } from '../../../shared/venueBooking.js'
import { PLANNING, CONFIRMED, DRAFT } from '../../../shared/status.js'
import { coordinator, staff, secondStaff, organiser, input } from '../fixtures.js'

describe('SPM-14 booking rules', () => {
  it('validates required fields, metadata and time ranges', () => {
    expect(normaliseVenueBooking(input).errors).toEqual({})
    for (const key of ['venueId', 'startsAt', 'endsAt', 'requirements', 'submissionKey']) {
      expect(Object.keys(normaliseVenueBooking({ ...input, [key]: '' }).errors)).toContain(key)
    }
    expect(normaliseVenueBooking({ ...input, endsAt: input.startsAt }).errors.endsAt).toBeTruthy()
    expect(normaliseVenueBooking({ ...input, assignedVenueStaffUid: 'forged' }).errors.assignedVenueStaffUid).toBeTruthy()
    expect(normaliseVenueBooking({ ...input, venueId: '../hall' }).errors.venueId).toBeTruthy()
    expect(normaliseVenueBooking({ ...input, requirements: 3 }).errors.requirements).toBeTruthy()
  })
  it('warns only above capacity without blocking submission', () => {
    expect(capacityWarning(99, 100)).toBeNull()
    expect(capacityWarning(100, 100)).toBeNull()
    expect(capacityWarning(101, 100)).toContain('exceeds venue capacity')
  })
  it('requires the coordinator role, its own assignment and Planning together', () => {
    const event = { status: PLANNING, assignedCoordinatorUid: coordinator.uid }
    expect(canRequestVenue(coordinator, event)).toBe(true)
    for (const status of [DRAFT, CONFIRMED]) expect(canRequestVenue(coordinator, { ...event, status })).toBe(false)
    expect(canRequestVenue({ ...coordinator, uid: 'elsewhere', roles: [...coordinator.roles, ...staff.roles] }, event)).toBe(false)
    expect(canRequestVenue({ ...staff, uid: coordinator.uid }, event)).toBe(false)
    expect(canReadVenueBooking(staff, event, { assignedVenueStaffUid: staff.uid })).toBe(true)
    expect(canReadVenueBooking(secondStaff, event, { assignedVenueStaffUid: staff.uid })).toBe(false)
    expect(canReadVenueBooking(organiser, event, {})).toBe(false)
  })
  it('chooses least pending work and cycles equal workloads', () => {
    const users = [staff, secondStaff, organiser]
    expect(chooseVenueStaff(users, [], null).uid).toBe('v1')
    expect(chooseVenueStaff(users, [], 'v1').uid).toBe('v2')
    expect(chooseVenueStaff(users, [], 'v2').uid).toBe('v1')
    expect(chooseVenueStaff(users, [{ status: BOOKING_PENDING, assignedVenueStaffUid: 'v1' }], 'v2').uid).toBe('v2')
    expect(chooseVenueStaff([organiser], [], null)).toBeNull()
    expect(chooseVenueStaff([{ uid: 'legacy', role: 'venue_staff' }], [], null).uid).toBe('legacy')
  })
})
