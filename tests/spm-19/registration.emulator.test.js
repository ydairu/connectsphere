// SPM-19 — the last place, against a real Firestore emulator. Several Attendees register for a two-place event at
// once; the registration lock (systemLocks/registration-{eventId}) must let exactly two through. Skipped unless
// run through runEmulatorTests.js with the emulator on 127.0.0.1:8085 (CI: "Attendee registration transactions").

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { registerForEvent } from '../../backend/src/services/registrationService.js'
import { ATTENDEE, ORGANISER } from '../../shared/permissions.js'
import { REGISTRATIONS_COLLECTION } from '../../shared/registration.js'
import { CONFIRMED } from '../../shared/status.js'

const projectId = 'demo-connectsphere-spm19'
const enabled = process.env.SPM19_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
const DAY = 24 * 60 * 60 * 1000
const attendees = Array.from({ length: 5 }, (_, index) => ({ uid: `attendee-${index}`, roles: [ATTENDEE], name: `Attendee ${index}`, email: `attendee-${index}@example.test` }))

describe.skipIf(!enabled)('SPM-19 registration transaction concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm19-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-19 test emulator')
    const now = Date.now()
    await db.collection('eventRequests').doc('event').set({
      status: CONFIRMED,
      ownerUid: 'organiser',
      organisationId: 'org-a',
      assignedCoordinatorUid: 'coordinator',
      assignedStaffUids: [],
      core: { title: 'Two-place event', preferredDateTime: new Date(now + 30 * DAY).toISOString(), durationHours: 2 },
      registration: { enabled: true, opensAt: new Date(now - DAY).toISOString(), closesAt: new Date(now + 29 * DAY).toISOString(), capacity: 2 },
    })
    await db.collection('users').doc('organiser').set({ roles: [ORGANISER] })
  })
  afterAll(async () => { if (app) await deleteApp(app) })

  it('lets exactly two of five simultaneous Attendees take the two places', async () => {
    const results = await Promise.allSettled(attendees.map((attendee) => registerForEvent('event', attendee, db)))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)
    const refusals = results.filter((result) => result.status === 'rejected').map((result) => result.reason.reason)
    expect(refusals).toEqual(['full', 'full', 'full'])
    const stored = await db.collection(REGISTRATIONS_COLLECTION).where('eventRequestId', '==', 'event').get()
    expect(stored.size).toBe(2)
  }, 60000)

  it('lets one Attendee register only once when they submit twice at the same time', async () => {
    const results = await Promise.allSettled([registerForEvent('event', attendees[0], db), registerForEvent('event', attendees[0], db)])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(results.find((result) => result.status === 'rejected').reason.reason).toBe('already_registered')
    expect((await db.collection(REGISTRATIONS_COLLECTION).get()).size).toBe(1)
  }, 60000)
})
