import { describe, expect, it } from 'vitest'
import { fixture as venueFixture, input as venueInput, coordinator as venueCoordinator, now as venueNow } from '../../spm-14/fixtures.js'
import { fixture as equipmentFixture, input as equipmentInput, coordinator as equipmentCoordinator, now as equipmentNow } from '../../spm-17/fixtures.js'
import { submitVenueBooking, BOOKINGS } from '../../../backend/src/services/venueBookingService.js'
import { submitEquipmentRequest } from '../../../backend/src/services/equipmentRequestService.js'
import { EQUIPMENT_REQUESTS_COLLECTION, EQUIPMENT_REQUEST_STATUS } from '../../../shared/equipmentRequest.js'

describe('SPM-71 request routing with legacy request ownership', () => {
  it('routes new and replacement venue bookings to the event owner without changing the old reviewer', async () => {
    const db = venueFixture()
    db.store.get('event').assignedVenueStaffUid = 'v2'
    db.store.get('event').assignedStaffUids = ['v1', 'v2']
    const old = await submitVenueBooking('event', venueInput, venueCoordinator, db, venueNow)
    expect(db.collectionData(BOOKINGS).get(old.id).assignedVenueStaffUid).toBe('v2')
    // Simulate a booking created before the event-level assignment was introduced.
    db.collectionData(BOOKINGS).get(old.id).assignedVenueStaffUid = 'v1'
    const replacement = await submitVenueBooking('event', { ...venueInput, submissionKey: 'replace', replacesId: old.id }, venueCoordinator, db, venueNow)
    expect(db.collectionData(BOOKINGS).get(replacement.id).assignedVenueStaffUid).toBe('v2')
    expect(db.collectionData(BOOKINGS).get(old.id).assignedVenueStaffUid).toBe('v1')
  })

  it('routes a revised equipment request to the event owner while preserving the earlier reviewer', async () => {
    const db = equipmentFixture({ eventOverrides: { assignedTechnicalStaffUid: 't2', assignedStaffUids: ['t1', 't2'] } })
    const old = await submitEquipmentRequest('event', equipmentInput, equipmentCoordinator, db, equipmentNow)
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(old.id).assignedTechnicalStaffUid).toBe('t2')
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(old.id).assignedTechnicalStaffUid = 't1'
    db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(old.id).status = EQUIPMENT_REQUEST_STATUS.REJECTED
    const revised = await submitEquipmentRequest('event', { ...equipmentInput, submissionKey: 'revised' }, equipmentCoordinator, db, equipmentNow)
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(revised.id).assignedTechnicalStaffUid).toBe('t2')
    expect(db.collectionData(EQUIPMENT_REQUESTS_COLLECTION).get(old.id).assignedTechnicalStaffUid).toBe('t1')
  })
})
