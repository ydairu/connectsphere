// Dry run by default. To write verified single-venue Confirmed events, pass --write and the configured
// Firebase project ID. Multi-venue events are reported for Coordinator selection, never guessed.
import { parseArgs } from 'node:util'
import { CONFIRMED } from '../../shared/status.js'
import { primaryVenueFromBooking, primaryVenueReadiness } from '../../shared/primaryVenue.js'
import { BOOKING_APPROVED, currentVenueBookingGroups } from '../../shared/venueBooking.js'
import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { env } from '../src/config/env.js'
import { BOOKINGS } from '../src/services/venueBookingService.js'
import { validConfirmedBookingHold } from '../src/services/primaryVenueService.js'
import { recordPrimaryVenueChange } from '../src/services/primaryVenueHistory.js'

const { values } = parseArgs({ options: { write: { type: 'boolean' }, project: { type: 'string' } } })
if (!env.firebaseProjectId) throw new Error('FIREBASE_PROJECT_ID is required.')
if (values.write && values.project !== env.firebaseProjectId) {
  throw new Error('To write, pass --project=<FIREBASE_PROJECT_ID> matching the configured project.')
}
const db = getAdminDb()
console.log(`Project: ${env.firebaseProjectId}; mode: ${values.write ? 'write' : 'dry run'}`)
const events = await db.collection('eventRequests').where('status', '==', CONFIRMED).get()
let eligible = 0
let updated = 0
let manual = 0
for (const doc of events.docs) {
  if (doc.data().primaryVenue) continue
  const bookings = (await db.collection(BOOKINGS).where('eventRequestId', '==', doc.id).get()).docs
    .map((booking) => ({ id: booking.id, ...booking.data() }))
  const state = primaryVenueReadiness(doc.data(), bookings)
  const booking = state.automaticBooking
  if (!booking || !(await validConfirmedBookingHold(booking, doc.id, db))) {
    const current = currentVenueBookingGroups(bookings).map((group) => group.current)
    const approved = current.filter((item) => item.status === BOOKING_APPROVED)
    console.log(current.length > 1 && approved.length === current.length
      ? `Coordinator selection needed: ${doc.id} (${approved.map((item) => item.id).join(', ')})`
      : `Manual booking review: ${doc.id} (${current.length} current venue needs)`)
    manual++
    continue
  }
  eligible++
  console.log(`Single approved booking: ${doc.id} -> ${booking.id}`)
  if (!values.write) continue
  const changed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref)
    if (!fresh.exists || fresh.data().status !== CONFIRMED || fresh.data().primaryVenue) return false
    const currentBookings = (await tx.get(db.collection(BOOKINGS).where('eventRequestId', '==', doc.id))).docs
      .map((item) => ({ id: item.id, ...item.data() }))
    const current = primaryVenueReadiness(fresh.data(), currentBookings).automaticBooking
    if (!current || !(await validConfirmedBookingHold(current, doc.id, db, tx))) return false
    const venue = (await tx.get(db.collection('venues').doc(current.venueId))).data()
    const primaryVenue = primaryVenueFromBooking(current, venue?.location)
    const at = new Date().toISOString()
    tx.update(doc.ref, { primaryVenue, primaryVenueSelectionRequired: false, updatedAt: at })
    recordPrimaryVenueChange(tx, doc.ref, null, primaryVenue, { type: 'system', name: 'System', role: null }, at)
    return true
  })
  if (changed) updated++
}
console.log(`Eligible single-venue events: ${eligible}; updated: ${updated}; manual review: ${manual}`)
