import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { primaryVenueFromBooking, primaryVenueReadiness, publicPrimaryVenue } from './primaryVenue.js'

const hall = { id: 'hall-booking', venueNeedId: 'hall-need', venueId: 'hall', venueName: 'Main hall',
  startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z', status: 'approved', createdAt: '2026-10-01' }
const room = { ...hall, id: 'room-booking', venueNeedId: 'room-need', venueId: 'room', venueName: 'Breakout room' }

describe('SPM-90 primary venue readiness', () => {
  it('automatically selects only a sole approved current booking', () => {
    assert.equal(primaryVenueReadiness({}, [hall]).automaticBooking.id, hall.id)
    assert.equal(primaryVenueReadiness({}, [{ ...hall, status: 'pending' }]).ready, false)
    assert.equal(primaryVenueReadiness({}, [hall, room]).ready, false)
    assert.equal(primaryVenueReadiness({ primaryVenueSelectionRequired: true }, [hall]).ready, false)
  })

  it('recognises only a current approved selection', () => {
    const event = { primaryVenue: primaryVenueFromBooking(hall, 'Building A, Level 1') }
    assert.equal(primaryVenueReadiness(event, [hall, room]).ready, true)
    assert.equal(primaryVenueReadiness(event, [{ ...hall, status: 'cancelled' }, room]).ready, false)
    assert.equal(primaryVenueReadiness(event, [hall, { ...hall, id: 'replacement', replacesId: hall.id }]).ready, false)
    assert.deepEqual(publicPrimaryVenue(event.primaryVenue), {
      venueName: hall.venueName, location: 'Building A, Level 1', startsAt: hall.startsAt, endsAt: hall.endsAt,
    })
  })
})
