// SPM-59 against a real Firestore emulator: two registered Attendees withdraw at the same moment from a two-place event
// with three people waiting. The registration lock serialises the two transactions, so the first two in the queue are
// each invited once, the third keeps waiting, and no place is offered twice. Skipped unless run through
// runEmulatorTests.js with the emulator on 127.0.0.1:8085 (CI: "Withdrawal transactions").

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { joinWaitingList, registerForEvent, withdrawRegistration } from '../../backend/src/services/registrationService.js'
import { NOTIFICATIONS_COLLECTION, WAITING_LIST_INVITATION_NOTICE } from '../../shared/notifications.js'
import { ATTENDEE } from '../../shared/permissions.js'
import { INVITED, REGISTRATIONS_COLLECTION, WAITLISTED, WITHDRAWN } from '../../shared/registration.js'
import { CONFIRMED } from '../../shared/status.js'

const projectId = 'demo-connectsphere-spm59'
const enabled = process.env.SPM59_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
const DAY = 24 * 60 * 60 * 1000
const attendee = (name) => ({ uid: name, roles: [ATTENDEE], name, email: `${name}@example.test` })

describe.skipIf(!enabled)('SPM-59 withdrawal transaction concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm59-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-59 test emulator')
    const now = Date.now()
    await db.collection('eventRequests').doc('event').set({
      status: CONFIRMED,
      ownerUid: 'organiser',
      assignedCoordinatorUid: 'coordinator',
      assignedStaffUids: [],
      core: { title: 'Two-place event', preferredDateTime: new Date(now + 30 * DAY).toISOString(), durationHours: 2 },
      registration: { enabled: true, opensAt: new Date(now - DAY).toISOString(), closesAt: new Date(now + 29 * DAY).toISOString(), capacity: 2, withdrawalAllowed: true },
    })
    for (const name of ['reg-a', 'reg-b']) await registerForEvent('event', attendee(name), db)
    for (const name of ['wait-1', 'wait-2', 'wait-3']) await joinWaitingList('event', attendee(name), db)
  })
  afterAll(async () => { if (app) await deleteApp(app) })

  it('invites the first two waiting, once each, when two Attendees withdraw at once', async () => {
    const results = await Promise.allSettled([withdrawRegistration('event', attendee('reg-a'), db), withdrawRegistration('event', attendee('reg-b'), db)])
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    const records = Object.fromEntries((await db.collection(REGISTRATIONS_COLLECTION).get()).docs.map((doc) => [doc.data().attendeeUid, doc.data().status]))
    expect(records).toEqual({ 'reg-a': WITHDRAWN, 'reg-b': WITHDRAWN, 'wait-1': INVITED, 'wait-2': INVITED, 'wait-3': WAITLISTED })
    const notices = (await db.collection(NOTIFICATIONS_COLLECTION).where('type', '==', WAITING_LIST_INVITATION_NOTICE).get()).docs.map((doc) => doc.data().recipientUid)
    expect(notices.sort()).toEqual(['wait-1', 'wait-2'])
  }, 60000)
})
