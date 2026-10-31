import { ACTIVE_EVENT_STAFF_STATUSES, EVENT_STAFF_FIELDS, EVENT_STAFF_LOCKS, EVENT_STAFF_NAME_FIELDS, EVENT_STAFF_ROLES, chooseEventStaff, countActiveEventStaff } from '../../../shared/eventStaffAssignment.js'
import { rolesOf } from '../../../shared/permissions.js'

export const EVENT_STAFF_ASSIGNED = 'event_staff_assigned'

export class EventStaffAssignmentError extends Error {
  constructor(role) {
    super(`No eligible ${role === 'venue_staff' ? 'Venue Staff' : 'Technical Support Staff'} account is available.`)
    this.name = 'EventStaffAssignmentError'
    this.status = 409
  }
}

const rows = (snapshot) => snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))

// All reads precede all writes. The two role locks serialise concurrent Planning
// transitions, including their workload counts and recency sequences.
export async function assignEventStaffInTransaction(tx, db, event, at, preferredUids = {}) {
  const missing = EVENT_STAFF_ROLES.filter((role) => !event[EVENT_STAFF_FIELDS[role]])
  if (!missing.length) return { update: {}, assignments: [] }
  const locks = await Promise.all(missing.map((role) => tx.get(db.collection('systemLocks').doc(EVENT_STAFF_LOCKS[role]))))
  const [usersSnapshot, eventsSnapshot] = await Promise.all([
    tx.get(db.collection('users')),
    tx.get(db.collection('eventRequests').where('status', 'in', ACTIVE_EVENT_STAFF_STATUSES)),
  ])
  const users = rows(usersSnapshot).map(({ id, ...profile }) => ({ ...profile, uid: id }))
  const events = rows(eventsSnapshot)
  const assignments = missing.map((role, index) => {
    const lock = locks[index].data() ?? {}
    const preferred = preferredUids[role]
    const staff = preferred
      ? users.find((profile) => profile.uid === preferred && rolesOf(profile).includes(role))
      : chooseEventStaff(users, role, countActiveEventStaff(events, role), lock.lastSequenceByUid)
    if (!staff || !rolesOf(staff).includes(role)) throw new EventStaffAssignmentError(role)
    const sequence = (lock.sequence ?? 0) + 1
    return { role, staff, lockRef: db.collection('systemLocks').doc(EVENT_STAFF_LOCKS[role]),
      lock: { ...lock, sequence, lastSequenceByUid: { ...lock.lastSequenceByUid, [staff.uid]: sequence }, updatedAt: at } }
  })
  const update = { assignedStaffUids: [...new Set([...(event.assignedStaffUids ?? []), ...assignments.map(({ staff }) => staff.uid)])] }
  for (const { role, staff, lockRef, lock } of assignments) {
    update[EVENT_STAFF_FIELDS[role]] = staff.uid
    update[EVENT_STAFF_NAME_FIELDS[role]] = staff.name ?? (role === 'venue_staff' ? 'Venue Staff' : 'Technical Support Staff')
    tx.set(lockRef, lock)
  }
  return { update, assignments }
}
