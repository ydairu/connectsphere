// SPM-91 — every change to the reviewed arrangements withdraws the current safety review: a new or replacement
// venue booking, a new equipment request and a rejected technical sign-off (the significant-change and booking
// cancellation paths are covered in safetyReviewApi.test.js and tests/spm-81). Real services against the
// in-memory Firestore double; not database verification.

import { describe, expect, it } from 'vitest'

import { submitVenueBooking } from '../../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { REJECT_TECHNICAL } from '../../../shared/requestActions.js'
import {
  INVALIDATED_BY_EQUIPMENT_REQUESTED,
  INVALIDATED_BY_TECHNICAL_REJECTED,
  INVALIDATED_BY_VENUE_BOOKING_REQUESTED,
  SAFETY_APPROVED,
  SAFETY_CHANGES_REQUESTED,
  SAFETY_INVALIDATED,
  SAFETY_REJECTED,
  SAFETY_REVIEW_PENDING,
} from '../../../shared/safetyReview.js'
import { coordinator as venueCoordinator, fixture as venueFixture, input, now as venueNow } from '../../spm-14/fixtures.js'
import { approvalFixture, now as equipmentNow, submitAs } from '../../spm-56/fixtures.js'

const withReview = (db, id, status) => {
  db.store.get(id).safetyReview = { status, submittedAt: 'earlier' }
}

describe('SPM-91 — a change to the arrangements withdraws the review', () => {
  for (const status of [SAFETY_APPROVED, SAFETY_REVIEW_PENDING, SAFETY_REJECTED]) {
    it(`a new venue booking request withdraws a ${status} review`, async () => {
      const db = venueFixture()
      withReview(db, 'event', status)
      await submitVenueBooking('event', input, venueCoordinator, db, venueNow)
      expect(db.store.get('event').safetyReview).toMatchObject({ status: SAFETY_INVALIDATED, invalidatedReason: INVALIDATED_BY_VENUE_BOOKING_REQUESTED, submittedAt: 'earlier' })
    })
  }

  it('changes requested are left for the Coordinator to resubmit', async () => {
    const db = venueFixture()
    withReview(db, 'event', SAFETY_CHANGES_REQUESTED)
    await submitVenueBooking('event', input, venueCoordinator, db, venueNow)
    expect(db.store.get('event').safetyReview.status).toBe(SAFETY_CHANGES_REQUESTED)
  })

  it('a new equipment request withdraws an approval', async () => {
    const db = approvalFixture()
    withReview(db, 'event', SAFETY_APPROVED)
    await submitAs(db)
    expect(db.store.get('event').safetyReview).toMatchObject({ status: SAFETY_INVALIDATED, invalidatedReason: INVALIDATED_BY_EQUIPMENT_REQUESTED })
  })

  it('a rejected technical sign-off withdraws an approval; nothing changes when there is no review', async () => {
    const technicalStaff = { uid: 't1', name: 'Tech One', roles: ['technical_staff'] }
    const event = (overrides) => ({
      status: 'planning', assignedCoordinatorUid: 'c', assignedStaffUids: ['t1'], ownerUid: 'o',
      core: { title: 'Forum' }, equipment: { requirements: ['Projector'], technicalSupportNeeded: true }, ...overrides,
    })
    const { createFakeFirestore } = await import('../../../backend/src/testing/fakeFirestore.js')
    const db = createFakeFirestore({ eventRequests: { event: event({ safetyReview: { status: SAFETY_APPROVED } }), plain: event({}) } })
    await transitionEventRequest('event', REJECT_TECHNICAL, technicalStaff, db, equipmentNow)
    expect(db.store.get('event').safetyReview).toMatchObject({ status: SAFETY_INVALIDATED, invalidatedReason: INVALIDATED_BY_TECHNICAL_REJECTED })
    await transitionEventRequest('plain', REJECT_TECHNICAL, technicalStaff, db, equipmentNow)
    expect(db.store.get('plain').safetyReview).toBeUndefined()
  })
})
