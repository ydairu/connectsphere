// SPM-46 — the assigned Event Coordinator as an Event Organiser sees them.
//
// "The assigned Event Coordinator acts as the primary point of contact for the Organiser." — G8 Session 1
// (docs/requirements/clarification-session-1.md §4). An event has at most one Coordinator, stored as the
// single `assignedCoordinatorUid` (SPM-8), so there is one summary per event, never a list.
//
// Pure functions: the backend looks the name up in users/{uid} only when mayViewAssignedCoordinator()
// allows it, then passes it here. The Organiser receives the display name and nothing else — never the
// uid, email or roles.

import { ORGANISER, inScopeAs } from './permissions.js'
import { DRAFT } from './status.js'

/**
 * Does this user see the assigned Coordinator on this request? Only through the Organiser role, on a
 * record that role puts in scope: the owner, or a same-organisation colleague (SPM-42). [Team decision,
 * 3 Oct 2026] Colleagues who may view the event see its Coordinator too. Drafts have no Coordinator.
 * Coordinators, staff and attendees receive nothing new.
 */
export function mayViewAssignedCoordinator(user, request) {
  return request.status !== DRAFT && inScopeAs(ORGANISER, user, request)
}

/**
 * The uid whose users/{uid}.name the backend should load for this user, or null when no lookup is
 * needed — not visible to them, or no Coordinator assigned yet.
 */
export function coordinatorUidToLookUp(user, request) {
  if (!mayViewAssignedCoordinator(user, request)) return null
  return request.assignedCoordinatorUid || null
}

function displayName(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * What the API returns as `assignedCoordinator`:
 *   null                                not visible to this user (every draft, every non-Organiser view)
 *   { assigned: false, name: null }     submitted but no Coordinator yet — shown as "Not yet assigned"
 *   { assigned: true, name: 'Ada' }     the Coordinator's display name
 *   { assigned: true, name: null }      assigned, but their profile has no usable name — [Team decision,
 *                                       3 Oct 2026] shown as "Assigned (name unavailable)", never as
 *                                       "Not yet assigned"
 *
 * `coordinatorName` is users/{assignedCoordinatorUid}.name, or null if it could not be read.
 */
export function assignedCoordinatorSummary(user, request, coordinatorName) {
  if (!mayViewAssignedCoordinator(user, request)) return null
  if (!request.assignedCoordinatorUid) return { assigned: false, name: null }
  return { assigned: true, name: displayName(coordinatorName) }
}
