import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeFirestore } from '../testing/fakeFirestore.js'
import { TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { applyEventStaffBackfill, inspectEventStaffBackfill } from './eventStaffBackfillService.js'

test('SPM-71 backfill inspects without writing, preserves old request owners and is idempotent', async () => {
  const db = createFakeFirestore({
    users: { old: { roles: [VENUE_STAFF], name: 'Old Venue' }, newest: { roles: [VENUE_STAFF], name: 'New Venue' },
      tech: { roles: [TECHNICAL_STAFF], name: 'Tech' } },
    eventRequests: { event: { status: 'planning', assignedStaffUids: ['old', 'newest', 'tech'] } },
    venueBookingRequests: {
      first: { eventRequestId: 'event', createdAt: '2026-01-01', assignedVenueStaffUid: 'old' },
      second: { eventRequestId: 'event', createdAt: '2026-02-01', assignedVenueStaffUid: 'newest' },
    },
    equipmentRequests: { equipment: { eventRequestId: 'event', createdAt: '2026-01-02', assignedTechnicalStaffUid: 'tech' } },
  })
  const beforeBookings = structuredClone([...db.collectionData('venueBookingRequests')])
  const beforeEquipment = structuredClone([...db.collectionData('equipmentRequests')])
  const preview = await inspectEventStaffBackfill(db, 'event')
  assert.equal(preview.needed, true)
  assert.deepEqual(preview.preferredUids, { venue_staff: 'newest', technical_staff: 'tech' })
  assert.equal(db.transactions.length, 0)
  assert.equal(db.store.get('event').assignedVenueStaffUid, undefined)

  assert.equal(await applyEventStaffBackfill(db, 'event', new Date('2026-10-29T10:00:00Z')), true)
  assert.equal(db.store.get('event').assignedVenueStaffUid, 'newest')
  assert.equal(db.store.get('event').assignedTechnicalStaffUid, 'tech')
  assert.deepEqual([...db.collectionData('venueBookingRequests')], beforeBookings)
  assert.deepEqual([...db.collectionData('equipmentRequests')], beforeEquipment)
  const noticeCount = db.collectionData('notifications').size
  assert.equal(await applyEventStaffBackfill(db, 'event', new Date('2026-10-29T11:00:00Z')), false)
  assert.equal(db.collectionData('notifications').size, noticeCount)
  assert.equal((await inspectEventStaffBackfill(db, 'event')).needed, false)
})
