import { ACTIVE_EVENT_STAFF_STATUSES, EVENT_STAFF_FIELDS, EVENT_STAFF_ROLES } from '../../../shared/eventStaffAssignment.js'
import { preferredLegacyStaff } from '../../../shared/eventStaffBackfill.js'
import { EQUIPMENT_REQUESTS_COLLECTION } from '../../../shared/equipmentRequest.js'
import { eventStaffAssignedNotifications } from '../../../shared/notifications.js'
import { BOOKINGS } from './venueBookingService.js'
import { EVENT_STAFF_ASSIGNED, assignEventStaffInTransaction } from './eventStaffAssignmentService.js'
import { addNotifications } from './notificationService.js'

const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const needsBackfill = (event) => ACTIVE_EVENT_STAFF_STATUSES.includes(event?.status) &&
  EVENT_STAFF_ROLES.some((role) => !event[EVENT_STAFF_FIELDS[role]])

async function inputs(db, eventId, tx = null) {
  const get = (target) => tx ? tx.get(target) : target.get()
  const [event, bookings, equipment, profiles] = await Promise.all([
    get(db.collection('eventRequests').doc(eventId)),
    get(db.collection(BOOKINGS).where('eventRequestId', '==', eventId)),
    get(db.collection(EQUIPMENT_REQUESTS_COLLECTION).where('eventRequestId', '==', eventId)),
    get(db.collection('users')),
  ])
  const users = rows(profiles).map(({ id, ...profile }) => ({ ...profile, uid: id }))
  return { event, bookings: rows(bookings), equipment: rows(equipment), users }
}

export async function inspectEventStaffBackfill(db, eventId) {
  const current = await inputs(db, eventId)
  if (!current.event.exists || !needsBackfill(current.event.data())) return { needed: false, preferredUids: {}, report: [] }
  return { needed: true, ...preferredLegacyStaff(current.event.data(), current.users, current.bookings, current.equipment) }
}

export async function applyEventStaffBackfill(db, eventId, now = new Date()) {
  return db.runTransaction(async (tx) => {
    const current = await inputs(db, eventId, tx)
    if (!current.event.exists || !needsBackfill(current.event.data())) return false
    const event = { id: eventId, ...current.event.data() }
    const { preferredUids } = preferredLegacyStaff(event, current.users, current.bookings, current.equipment)
    const at = now.toISOString()
    const { update, assignments } = await assignEventStaffInTransaction(tx, db, event, at, preferredUids)
    if (!assignments.length) return false
    tx.update(current.event.ref, { ...update, updatedAt: at })
    for (const { role, staff } of assignments) {
      tx.set(current.event.ref.collection('activity').doc(), { type: EVENT_STAFF_ASSIGNED, role, staffUid: staff.uid,
        actor: { type: 'system', name: 'System', role: null }, at, source: 'backfill' })
    }
    addNotifications(tx, db, eventStaffAssignedNotifications(event, assignments, at))
    return true
  })
}
