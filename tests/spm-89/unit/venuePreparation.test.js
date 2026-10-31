import { describe, expect, it } from 'vitest'
import { bookingPreparation, canUpdateBookingPreparation, eventPreparationReadiness, venuePreparationErrors } from '../../../shared/venuePreparation.js'
import { venuePreparationMigrationDecision } from '../../../shared/venuePreparationMigration.js'
import { PREPARATION, PLANNING } from '../../../shared/status.js'

const event = { id: 'event', status: PREPARATION, equipmentPreparation: { status: 'ready' } }
const staff = { uid: 'staff', roles: ['venue_staff'] }
const booking = (id, status = 'approved', preparation = undefined) => ({ id, eventRequestId: 'event', venueNeedId: id,
  venueName: id, assignedVenueStaffUid: 'staff', status, ...(preparation ? { preparation } : {}) })

describe('SPM-89 per-booking rules', () => {
  it('defaults each booking independently and requires all current venues plus equipment', () => {
    const first = booking('hall', 'approved', { status: 'ready', notes: 'Done' })
    const second = booking('room')
    expect(bookingPreparation(second)).toEqual({ status: 'not_started', notes: '' })
    expect(eventPreparationReadiness(event, [first, second])).toMatchObject({ ready: false, equipmentReady: true })
    expect(eventPreparationReadiness(event, [first, { ...second, preparation: { status: 'ready' } }]).ready).toBe(true)
    expect(eventPreparationReadiness({ ...event, equipmentPreparation: {} }, [first]).ready).toBe(false)
    expect(eventPreparationReadiness(event, []).ready).toBe(false)
    expect(eventPreparationReadiness(event, [first, booking('unapproved', 'pending')]).ready).toBe(true)
  })
  it('excludes cancelled, replaced and awaiting-reapproval attempts', () => {
    const old = booking('old', 'cancelled', { status: 'ready' })
    const replacement = { ...booking('new', 'approved', { status: 'ready' }), venueNeedId: 'old', replacesId: 'old' }
    expect(eventPreparationReadiness(event, [old]).ready).toBe(false)
    expect(eventPreparationReadiness(event, [old, replacement]).ready).toBe(true)
    expect(eventPreparationReadiness(event, [old, { ...replacement, reapprovalRequestedAt: '2026-10-31T00:00:00Z' }]).ready).toBe(false)
  })
  it('requires the assigned staff member, approved current booking and Preparation status', () => {
    const current = booking('hall')
    expect(canUpdateBookingPreparation(staff, event, current, [current])).toBe(true)
    expect(canUpdateBookingPreparation({ uid: 'other', roles: ['venue_staff'] }, event, current, [current])).toBe(false)
    expect(canUpdateBookingPreparation(staff, { ...event, status: PLANNING }, current, [current])).toBe(false)
    expect(canUpdateBookingPreparation(staff, event, { ...current, status: 'cancelled' }, [{ ...current, status: 'cancelled' }])).toBe(false)
  })
  it('uses SPM-48 values and notes limit', () => {
    expect(venuePreparationErrors({ status: 'ready', notes: 'x'.repeat(2000) })).toEqual({})
    expect(venuePreparationErrors({ status: 'done', notes: 'x'.repeat(2001), extra: true })).toHaveProperty('venuePreparation.status')
    expect(venuePreparationErrors({})).toHaveProperty('preparation')
  })
})

describe('SPM-89 legacy migration decision', () => {
  const legacy = { venuePreparation: { status: 'in_progress', notes: 'Set up' } }
  it('copies only one current approved booking and is idempotent', () => {
    expect(venuePreparationMigrationDecision(legacy, [booking('hall')])).toMatchObject({ kind: 'copy', bookingId: 'hall' })
    expect(venuePreparationMigrationDecision(legacy, [booking('hall'), booking('pending', 'pending')]))
      .toMatchObject({ kind: 'copy', bookingId: 'hall' })
    expect(venuePreparationMigrationDecision(legacy, [booking('hall', 'approved', { status: 'ready' })]).kind).toBe('already_set')
  })
  it('leaves multi-venue or missing values untouched', () => {
    expect(venuePreparationMigrationDecision(legacy, [booking('hall'), booking('room')]).kind).toBe('manual')
    expect(venuePreparationMigrationDecision({}, [booking('hall')]).kind).toBe('none')
    expect(venuePreparationMigrationDecision(legacy, []).kind).toBe('manual')
  })
})
