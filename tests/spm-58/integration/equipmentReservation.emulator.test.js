// SPM-58 — "Given two attempts to reserve the same units at about the same time, the first one saved succeeds
// and the second is refused", against a real Firestore emulator (real transactions and retries), as SPM-14's
// emulator suite does for venue holds. Explicit local emulator only: never the .env project or credentials.
// Skipped unless run through tests/spm-58/runEmulatorTests.js.

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import { decideEquipmentRequest, submitEquipmentRequest } from '../../../backend/src/services/equipmentRequestService.js'
import { APPROVE_EQUIPMENT_REQUEST, EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS, RESERVE_EQUIPMENT } from '../../../shared/equipmentRequest.js'
import { EQUIPMENT_RESERVATIONS_COLLECTION, RESERVATION_STATUS } from '../../../shared/equipmentReservation.js'
import { approvalFixture, coordinator, now, otherCoordinator, secondTech, tech } from '../../spm-56/fixtures.js'

const PROJECT = 'demo-connectsphere-bookings'
const enabled = process.env.SPM58_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'

describe.skipIf(!enabled)('SPM-58 real Firestore emulator: reservation concurrency', () => {
  let app
  let db

  beforeEach(async () => {
    if (!app) {
      app = initializeApp({ projectId: PROJECT }, 'spm58-emulator')
      db = getFirestore(app)
    }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset the reservation test emulator')
    // SPM-56's fixture: 'event' and 'other' at the same period; 3 Available projectors (and one Damaged).
    const memory = approvalFixture()
    const batch = db.batch()
    for (const collection of ['users', 'eventRequests', 'equipmentTypes', 'equipmentUnits']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })

  afterAll(async () => {
    if (app) await deleteApp(app)
  })

  const assigneeOf = async (requestId) => {
    const uid = (await db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(requestId).get()).data().assignedTechnicalStaffUid
    return [tech, secondTech].find((staff) => staff.uid === uid)
  }

  // Submit as the event's Coordinator and approve as its assignee, through the real services.
  async function approved(eventId, user, quantity, key) {
    const request = await submitEquipmentRequest(eventId, { items: [{ equipmentTypeId: 'projector', quantity }], submissionKey: key }, user, db, now)
    const assignee = await assigneeOf(request.id)
    await decideEquipmentRequest(eventId, request.id, APPROVE_EQUIPMENT_REQUEST, assignee, db, now)
    return { id: request.id, assignee }
  }

  it('spm58_emulator_two_overlapping_reservations_at_once_one_succeeds_and_the_other_is_refused', async () => {
    // Each wants 2 of the 3 projectors for the same period, so only one can have them.
    const mine = await approved('event', coordinator, 2, 'race-event')
    const theirs = await approved('other', otherCoordinator, 2, 'race-other')

    const results = await Promise.allSettled([
      decideEquipmentRequest('event', mine.id, RESERVE_EQUIPMENT, mine.assignee, db, now),
      decideEquipmentRequest('other', theirs.id, RESERVE_EQUIPMENT, theirs.assignee, db, now),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const refused = results.filter((result) => result.status === 'rejected')
    expect(refused).toHaveLength(1)
    expect(refused[0].reason.name).toBe('EquipmentRequestShortfallError')

    const reservations = (await db.collection(EQUIPMENT_RESERVATIONS_COLLECTION).get()).docs.map((doc) => doc.data())
    expect(reservations).toHaveLength(1)
    expect(reservations[0].status).toBe(RESERVATION_STATUS.ACTIVE)
    expect(reservations[0].unitIds).toHaveLength(2)
    const statuses = await Promise.all([mine.id, theirs.id].map(async (id) => (await db.collection(EQUIPMENT_REQUESTS_COLLECTION).doc(id).get()).data().status))
    expect(statuses.sort()).toEqual([EQUIPMENT_REQUEST_STATUS.APPROVED, EQUIPMENT_REQUEST_STATUS.RESERVED].sort())
  }, 60000)

  it('spm58_emulator_many_simultaneous_reservations_never_commit_a_unit_twice', async () => {
    // Five events at the same period each want one projector; there are three.
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    const batch = db.batch()
    for (let index = 0; index < 5; index += 1) batch.set(db.collection('eventRequests').doc(`race-${index}`), { ...event })
    await batch.commit()
    const requests = []
    for (let index = 0; index < 5; index += 1) requests.push({ eventId: `race-${index}`, ...(await approved(`race-${index}`, coordinator, 1, `many-${index}`)) })

    const results = await Promise.allSettled(requests.map(({ eventId, id, assignee }) => decideEquipmentRequest(eventId, id, RESERVE_EQUIPMENT, assignee, db, now)))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
    expect(results.filter((result) => result.status === 'rejected').every((result) => result.reason.name === 'EquipmentRequestShortfallError')).toBe(true)
    const unitIds = (await db.collection(EQUIPMENT_RESERVATIONS_COLLECTION).get()).docs.flatMap((doc) => doc.data().unitIds)
    expect(unitIds).toHaveLength(3)
    expect(new Set(unitIds).size).toBe(3)
  }, 60000)

  it('spm58_emulator_back_to_back_reservations_both_succeed_at_once', async () => {
    // 'other' ends exactly when 'event' starts: back to back, so all 3 projectors can go to both.
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    const start = new Date(event.core.preferredDateTime)
    const earlierStart = new Date(start.getTime() - event.core.durationHours * 60 * 60 * 1000).toISOString()
    await db.collection('eventRequests').doc('other').set({ ...event, assignedCoordinatorUid: otherCoordinator.uid, core: { ...event.core, preferredDateTime: earlierStart } })
    const mine = await approved('event', coordinator, 3, 'b2b-event')
    const theirs = await approved('other', otherCoordinator, 3, 'b2b-other')

    const results = await Promise.allSettled([
      decideEquipmentRequest('event', mine.id, RESERVE_EQUIPMENT, mine.assignee, db, now),
      decideEquipmentRequest('other', theirs.id, RESERVE_EQUIPMENT, theirs.assignee, db, now),
    ])

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
  }, 60000)
})
