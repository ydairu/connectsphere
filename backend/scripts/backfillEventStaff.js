// SPM-71 migration. Dry-run by default; write mode rechecks each event in a
// transaction and never changes historical venue or equipment request records.
import { parseArgs } from 'node:util'
import { ACTIVE_EVENT_STAFF_STATUSES, EVENT_STAFF_FIELDS, EVENT_STAFF_LOCKS, EVENT_STAFF_ROLES, chooseEventStaff, countActiveEventStaff } from '../../shared/eventStaffAssignment.js'
import { eventStaffRecordTime } from '../../shared/eventStaffBackfill.js'
import { rolesOf } from '../../shared/permissions.js'
import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { env } from '../src/config/env.js'
import { applyEventStaffBackfill, inspectEventStaffBackfill } from '../src/services/eventStaffBackfillService.js'
import { banner, resolveWriteMode } from './writeGuard.js'

const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const needsBackfill = (event) => ACTIVE_EVENT_STAFF_STATUSES.includes(event.status) &&
  EVENT_STAFF_ROLES.some((role) => !event[EVENT_STAFF_FIELDS[role]])

const { values } = parseArgs({ options: { write: { type: 'boolean', default: false }, project: { type: 'string' } }, strict: true })
const mode = resolveWriteMode(values, env.firebaseProjectId)
console.log(banner('backfill-event-staff — SPM-71', env.firebaseProjectId, mode))
if (!mode.ok) throw new Error(mode.message)

const db = getAdminDb()
const eventsSnapshot = await db.collection('eventRequests').get()
const allEvents = rows(eventsSnapshot)
const events = allEvents.filter(needsBackfill).sort((a, b) =>
  eventStaffRecordTime(a.createdAt) - eventStaffRecordTime(b.createdAt) || a.id.localeCompare(b.id))
console.log(`Active events requiring backfill: ${events.length}`)

// Preview the same workload and per-role sequence changes in the planned write
// order. Write mode still recalculates each choice in its Firestore transaction.
const users = rows(await db.collection('users').get()).map(({ id, ...profile }) => ({ ...profile, uid: id }))
const counts = Object.fromEntries(EVENT_STAFF_ROLES.map((role) => [role, countActiveEventStaff(allEvents, role)]))
const locks = Object.fromEntries(await Promise.all(EVENT_STAFF_ROLES.map(async (role) => {
  const snapshot = await db.collection('systemLocks').doc(EVENT_STAFF_LOCKS[role]).get()
  return [role, snapshot.data() ?? {}]
})))
for (const event of events) {
  const plan = await inspectEventStaffBackfill(db, event.id)
  const proposedUids = {}
  for (const role of EVENT_STAFF_ROLES) {
    if (event[EVENT_STAFF_FIELDS[role]]) continue
    const preferred = plan.preferredUids[role]
    const staff = preferred
      ? users.find((user) => user.uid === preferred && rolesOf(user).includes(role))
      : chooseEventStaff(users, role, counts[role], locks[role].lastSequenceByUid)
    if (!staff) throw new Error(`Cannot plan ${role} for ${event.id}: no eligible account`)
    proposedUids[role] = staff.uid
    counts[role].set(staff.uid, (counts[role].get(staff.uid) ?? 0) + 1)
    const sequence = (locks[role].sequence ?? 0) + 1
    locks[role] = { ...locks[role], sequence, lastSequenceByUid: { ...locks[role].lastSequenceByUid, [staff.uid]: sequence } }
  }
  console.log(`${event.id}: ${JSON.stringify(proposedUids)}${plan.report.length ? ` — ${plan.report.join('; ')}` : ''}`)
}

if (!mode.write) {
  console.log('Dry run only. Proposed choices reflect this snapshot; write mode recalculates from fresh data.')
} else {
  let updated = 0
  for (const event of events) {
    const changed = await applyEventStaffBackfill(db, event.id)
    if (changed) updated++
  }
  console.log(`Events updated: ${updated}; repeat runs skip already assigned roles.`)
}
