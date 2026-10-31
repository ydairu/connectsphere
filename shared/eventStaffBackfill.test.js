import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventStaffRecordTime, preferredLegacyStaff } from './eventStaffBackfill.js'
import { TECHNICAL_STAFF, VENUE_STAFF } from './permissions.js'

test('SPM-71 backfill chooses the newest current eligible booking and newest equipment request', () => {
  const users = [
    { uid: 'old', roles: [VENUE_STAFF] }, { uid: 'new', roles: [VENUE_STAFF] },
    { uid: 'tech-old', roles: [TECHNICAL_STAFF] }, { uid: 'tech-new', roles: [TECHNICAL_STAFF] },
  ]
  const bookings = [
    { id: 'one', createdAt: '2026-01-01', assignedVenueStaffUid: 'old' },
    { id: 'two', createdAt: '2026-02-01', assignedVenueStaffUid: 'new' },
  ]
  const equipment = [
    { id: 'e1', createdAt: '2026-01-01', assignedTechnicalStaffUid: 'tech-old' },
    { id: 'e2', createdAt: '2026-02-01', assignedTechnicalStaffUid: 'tech-new' },
  ]
  const result = preferredLegacyStaff({ assignedStaffUids: ['old', 'tech-old'] }, users, bookings, equipment)
  assert.deepEqual(result.preferredUids, { [VENUE_STAFF]: 'new', [TECHNICAL_STAFF]: 'tech-new' })
  assert.ok(result.report.some((line) => line.includes('conflicting historical reviewers')))
})

test('SPM-71 backfill orders Firestore timestamps and ignores replaced venue attempts', () => {
  const timestamp = (millis) => ({ toMillis: () => millis })
  assert.equal(eventStaffRecordTime(timestamp(100)), 100)
  const users = [{ uid: 'old', roles: [VENUE_STAFF] }, { uid: 'new', roles: [VENUE_STAFF] }]
  const bookings = [
    { id: 'old', createdAt: timestamp(300), assignedVenueStaffUid: 'old' },
    { id: 'new', replacesId: 'old', createdAt: timestamp(200), assignedVenueStaffUid: 'new' },
  ]
  const result = preferredLegacyStaff({ assignedStaffUids: [] }, users, bookings, [])
  assert.equal(result.preferredUids[VENUE_STAFF], 'new')
})
