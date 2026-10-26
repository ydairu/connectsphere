// SPM-88: real Express routes and middleware with an in-memory Firestore double.
// Safety approval is supplied by a server-side test verifier until SPM-91/92 provides the real one.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { PREPARATION_STARTED_NOTICE } from '../../../shared/notifications.js'
import { RESERVATION_STATUS } from '../../../shared/equipmentReservation.js'
import { CANCELLED, COMPLETED, CONFIRMED, PREPARATION } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, CANCEL, COMPLETE, START_PREPARATION } from '../../../shared/statusTransitions.js'
import { REQUEST_CANCELLATION } from '../../../shared/requestActions.js'
import { CONFIRMED_ID, createCancellationApi } from '../../shared/helpers/cancellationApi.js'

const { organiserA1, coordinator, coordinator3, venueStaff, technicalStaff, venueTechnicalStaff, attendee } = SEED_ACCOUNTS
const HOUR = 60 * 60 * 1000
let safetyApproved = false
const api = createCancellationApi({ verifySafetyApproval: async () => safetyApproved, includeReservations: true })

beforeAll(api.start)
afterAll(api.stop)
beforeEach(() => { api.reset(); safetyApproved = false })

async function startPreparation() {
  safetyApproved = true
  const response = await api.act(coordinator3, START_PREPARATION)
  expect(response.status).toBe(200)
  return response
}

describe('SPM-88 — start Preparation', () => {
  it('fails closed without a verified safety approval, with no status, history or notice writes', async () => {
    expect((await api.view(coordinator3)).json.availableActions).not.toContain(START_PREPARATION)
    const refused = await api.act(coordinator3, START_PREPARATION)
    expect(refused).toMatchObject({ status: 409, json: { reason: 'safety_approval_required' } })
    expect(api.stored().status).toBe(CONFIRMED)
    expect(api.activity()).toEqual([])
    expect(api.allNotifications()).toEqual([])
  })

  it('uses the assigned Coordinator, writes one status entry and one notice per assigned staff member', async () => {
    safetyApproved = true
    expect((await api.view(coordinator3)).json.availableActions).toContain(START_PREPARATION)
    expect((await api.act(coordinator, START_PREPARATION)).status).toBe(404)
    expect((await api.act(organiserA1, START_PREPARATION)).status).toBe(403)
    const response = await api.act(coordinator3, START_PREPARATION)
    expect(response.json.request.status).toBe(PREPARATION)
    expect(api.stored().status).toBe(PREPARATION)
    expect(api.activity()).toEqual([expect.objectContaining({
      type: STATUS_CHANGED, action: START_PREPARATION, fromStatus: CONFIRMED, toStatus: PREPARATION,
      actor: expect.objectContaining({ uid: coordinator3.uid }), at: expect.any(String),
    })])
    const recipients = api.allNotifications().filter((notice) => notice.type === PREPARATION_STARTED_NOTICE)
    expect(recipients.map((notice) => notice.recipientUid).sort()).toEqual([venueStaff.uid, technicalStaff.uid, venueTechnicalStaff.uid].sort())
    expect(new Set(recipients.map((notice) => notice.recipientUid)).size).toBe(3)
    const committed = api.transactions().filter((transaction) => transaction.committed)
    expect(committed).toHaveLength(1)
    expect(committed[0].writes.filter((path) => path === `eventRequests/${CONFIRMED_ID}`)).toHaveLength(1)
    expect(committed[0].writes.filter((path) => path.startsWith(`eventRequests/${CONFIRMED_ID}/activity/`))).toHaveLength(1)
    expect(committed[0].writes.filter((path) => path.startsWith('notifications/'))).toHaveLength(3)
  })

  it('lets assigned staff edit only their preparation section, while the Organiser and Attendee never receive it', async () => {
    await startPreparation()
    const venueEdit = await api.call('PATCH', `/api/requests/${CONFIRMED_ID}`, venueStaff, { venuePreparation: { status: 'ready' } })
    expect(venueEdit.status).toBe(200)
    const techEdit = await api.call('PATCH', `/api/requests/${CONFIRMED_ID}`, technicalStaff, { equipmentPreparation: { notes: 'Tested' } })
    expect(techEdit.status).toBe(200)
    expect((await api.call('PATCH', `/api/requests/${CONFIRMED_ID}`, venueStaff, { equipmentPreparation: { status: 'ready' } })).status).toBe(403)
    expect((await api.view(coordinator3)).json.request).toMatchObject({
      venuePreparation: { status: 'ready' }, equipmentPreparation: { notes: 'Tested' },
    })
    for (const account of [organiserA1, attendee]) {
      const view = await api.view(account)
      expect(view.json.request.status).toBe(PREPARATION)
      expect(view.json.request).not.toHaveProperty('venuePreparation')
      expect(view.json.request).not.toHaveProperty('equipmentPreparation')
    }
  })

  it('blocks significant edits in Preparation until SPM-87 can run the review in one transaction', async () => {
    await startPreparation()
    const original = api.stored().core.expectedAttendees
    const response = await api.call('PATCH', `/api/requests/${CONFIRMED_ID}`, coordinator3, {
      core: { expectedAttendees: original + 1 },
    })
    expect(response).toMatchObject({ status: 409, json: { reason: 'preparation_rereview_unavailable' } })
    expect(api.stored().status).toBe(PREPARATION)
    expect(api.stored().core.expectedAttendees).toBe(original)
    expect(api.activity()).toHaveLength(1)
  })

  it('requires Preparation and the event end before completion', async () => {
    expect((await api.act(coordinator3, COMPLETE)).json.reason).toBe('wrong_status')
    await startPreparation()
    expect((await api.act(coordinator3, COMPLETE)).json.reason).toBe('event_not_ended')
    api.setStart(CONFIRMED_ID, new Date(Date.now() - 5 * HOUR))
    expect((await api.act(coordinator3, COMPLETE)).json.request.status).toBe(COMPLETED)
    expect((await api.act(coordinator3, START_PREPARATION)).status).toBe(409)
  })

  it('cancels Preparation directly and releases its equipment reservation', async () => {
    await startPreparation()
    const response = await api.act(coordinator3, CANCEL, 'Venue closed')
    expect(response.json.request.status).toBe(CANCELLED)
    expect(api.stored().reservedEquipment).toBeNull()
    expect(api.reservations().filter((reservation) => reservation.eventRequestId === CONFIRMED_ID))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: RESERVATION_STATUS.RELEASED, releasedReason: 'event_cancelled' })]))
    expect(api.activity()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: STATUS_CHANGED, action: CANCEL, fromStatus: PREPARATION, toStatus: CANCELLED }),
    ]))
  })

  it('keeps an open Organiser cancellation request actionable after Preparation starts', async () => {
    expect((await api.act(organiserA1, REQUEST_CANCELLATION, 'Speaker withdrew')).status).toBe(200)
    await startPreparation()
    expect(api.stored().cancellationRequest.status).toBe('pending')
    expect((await api.act(coordinator3, CANCEL, 'Direct cancel')).json.reason).toBe('cancellation_request_pending')
    const response = await api.act(coordinator3, APPROVE_CANCELLATION)
    expect(response.json.request.status).toBe(CANCELLED)
    expect(api.stored().reservedEquipment).toBeNull()
    expect(api.reservations().filter((reservation) => reservation.eventRequestId === CONFIRMED_ID))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: RESERVATION_STATUS.RELEASED, releasedReason: 'event_cancelled' })]))
  })
})
