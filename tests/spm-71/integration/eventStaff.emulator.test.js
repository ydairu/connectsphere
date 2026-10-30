import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { COORDINATOR, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { APPROVE } from '../../../shared/statusTransitions.js'

const projectId = 'demo-connectsphere-spm71'
const enabled = process.env.SPM71_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
const coordinator = { uid: 'c', roles: [COORDINATOR] }
const event = { status: 'under_review', assignedCoordinatorUid: 'c', ownerUid: 'o', assignedStaffUids: [],
  core: { title: 'Forum', purpose: 'Updates', expectedAttendees: 40, preferredDateTime: '2027-03-10T10:00:00Z', durationHours: 2 },
  venue: { layoutPreference: 'Theatre' } }

describe.skipIf(!enabled)('SPM-71 Firestore assignment concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm71-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-71 emulator')
    const batch = db.batch()
    for (const [id, profile] of Object.entries({
      c: coordinator, v1: { name: 'Venue One', roles: [VENUE_STAFF] }, v2: { name: 'Venue Two', roles: [VENUE_STAFF] },
      t1: { name: 'Tech One', roles: [TECHNICAL_STAFF] }, t2: { name: 'Tech Two', roles: [TECHNICAL_STAFF] },
    })) batch.set(db.collection('users').doc(id), profile)
    for (const id of ['one', 'two']) batch.set(db.collection('eventRequests').doc(id), event)
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })

  it('serialises simultaneous Planning transitions and commits one assignment per role and event', async () => {
    const now = new Date('2026-10-29T10:00:00Z')
    const results = await Promise.all(['one', 'two'].map((id) => transitionEventRequest(id, APPROVE, coordinator, db, now)))
    expect(new Set(results.map((item) => item.assignedVenueStaffUid)).size).toBe(2)
    expect(new Set(results.map((item) => item.assignedTechnicalStaffUid)).size).toBe(2)
    for (const id of ['one', 'two']) {
      const saved = (await db.collection('eventRequests').doc(id).get()).data()
      expect(saved.status).toBe('planning')
      expect(saved.assignedStaffUids).toEqual([saved.assignedVenueStaffUid, saved.assignedTechnicalStaffUid])
      expect((await db.collection('eventRequests').doc(id).collection('activity').get()).size).toBe(3)
    }
    const notices = (await db.collection('notifications').get()).docs.map((doc) => doc.data())
    expect(notices.filter((notice) => notice.type === 'event_staff_assigned')).toHaveLength(4)
  }, 60000)
})
