// SPM-39 AC3 against a real Firestore emulator: several Attendees join a full event's waiting list at once. The
// registration lock (systemLocks/registration-{eventId}) serialises them, so each gets its own waitlistSequence and
// position, with no gaps or repeats. Skipped unless run through runEmulatorTests.js with the emulator on
// 127.0.0.1:8085 (CI: "Waiting list transactions").

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { joinWaitingList, registerForEvent } from '../../backend/src/services/registrationService.js'
import { ATTENDEE } from '../../shared/permissions.js'
import { REGISTRATIONS_COLLECTION, WAITLISTED } from '../../shared/registration.js'
import { CONFIRMED } from '../../shared/status.js'

const projectId = 'demo-connectsphere-spm39'
const enabled = process.env.SPM39_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
const DAY = 24 * 60 * 60 * 1000
const attendee = (index) => ({ uid: `attendee-${index}`, roles: [ATTENDEE], name: `Attendee ${index}`, email: `attendee-${index}@example.test` })

describe.skipIf(!enabled)('SPM-39 waiting-list transaction concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm39-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-39 test emulator')
    const now = Date.now()
    await db.collection('eventRequests').doc('event').set({
      status: CONFIRMED,
      ownerUid: 'organiser',
      assignedCoordinatorUid: 'coordinator',
      assignedStaffUids: [],
      core: { title: 'One-place event', preferredDateTime: new Date(now + 30 * DAY).toISOString(), durationHours: 2 },
      registration: { enabled: true, opensAt: new Date(now - DAY).toISOString(), closesAt: new Date(now + 29 * DAY).toISOString(), capacity: 1 },
    })
    await registerForEvent('event', attendee(0), db)
  })
  afterAll(async () => { if (app) await deleteApp(app) })

  it('gives five simultaneous joiners five distinct places in the queue', async () => {
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((index) => joinWaitingList('event', attendee(index), db)))
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect(results.map((result) => result.value.registration.waitingListPosition).sort()).toEqual([1, 2, 3, 4, 5])
    const stored = await db.collection(REGISTRATIONS_COLLECTION).where('status', '==', WAITLISTED).get()
    expect(stored.docs.map((doc) => doc.data().waitlistSequence).sort()).toEqual([1, 2, 3, 4, 5])
  }, 60000)
})
