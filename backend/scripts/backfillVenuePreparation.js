// Dry run by default. Explicit --write and the configured project ID are required to copy legacy values.
import { parseArgs } from 'node:util'
import { venuePreparationMigrationDecision } from '../../shared/venuePreparationMigration.js'
import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { env } from '../src/config/env.js'

const { values } = parseArgs({ options: { write: { type: 'boolean' }, project: { type: 'string' } } })
if (!env.firebaseProjectId) throw new Error('FIREBASE_PROJECT_ID is required.')
if (values.write && values.project !== env.firebaseProjectId) throw new Error('To write, pass --project=<FIREBASE_PROJECT_ID> matching the configured project.')
const db = getAdminDb()
console.log(`Project: ${env.firebaseProjectId}; mode: ${values.write ? 'write' : 'dry run'}`)
const events = await db.collection('eventRequests').get()
const counts = { copy: 0, manual: 0, already_set: 0, invalid: 0, none: 0, written: 0 }
for (const eventDoc of events.docs) {
  const eventId = eventDoc.id
  const loadBookings = async (reader) => (await (reader
    ? reader.get(db.collection('venueBookingRequests').where('eventRequestId', '==', eventId))
    : db.collection('venueBookingRequests').where('eventRequestId', '==', eventId).get())).docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
  const initial = venuePreparationMigrationDecision(eventDoc.data(), await loadBookings(null))
  counts[initial.kind]++
  if (initial.kind !== 'none') console.log(`${eventId}: ${initial.kind}${initial.bookingId ? ` -> ${initial.bookingId}` : ''}`)
  if (!values.write || initial.kind !== 'copy') continue
  const written = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(eventDoc.ref)
    if (!fresh.exists) return false
    const decision = venuePreparationMigrationDecision(fresh.data(), await loadBookings(tx))
    if (decision.kind !== 'copy') return false
    tx.update(db.collection('venueBookingRequests').doc(decision.bookingId), {
      preparation: decision.preparation, preparationMigratedAt: new Date().toISOString(),
    })
    return true
  })
  if (written) counts.written++
}
console.log(JSON.stringify(counts))
