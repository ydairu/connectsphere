// SPM-28 — the change history of an event's fields.
//
// Pure functions: no Firebase, no I/O. The backend records entries inside the transaction that saves a
// section edit (PATCH /api/requests/:id, the only path that writes event fields after submission) and
// serves them through GET /api/requests/:id/history; both decisions are made here.
//
// "Important actions must retain what changed, who changed it, and when, visible to authorised users where
// appropriate." — effective-requirements.md §3 (Customer-confirmed). Who may view, which statuses record,
// and that only field edits are recorded are team decisions of 4 Oct 2026, pending PO confirmation
// (effective-requirements.md §7, SPM-28).
//
// An entry is one document in the request's `activity` subcollection, in the shape every other activity
// entry uses (SPM-8, SPM-9, SPM-26):
//   { type: 'field_changed', field: 'core.title', oldValue, newValue,
//     actor: { type: 'user', uid, name, role }, at }
// `at` is added by the store when it writes the entry.

import { INTERNAL, ROLES, SECTIONS, canEdit, rolesOf } from './permissions.js'
import { isAssignedCoordinator, isOwningOrganiser } from './requestActors.js'
import { DRAFT } from './status.js'

export const FIELD_CHANGED = 'field_changed'

// --- Values ---------------------------------------------------------------------------------------

/**
 * The value as stored in an entry: plain JSON. Missing (undefined) becomes null, a Date its ISO string,
 * a non-finite number null; arrays and objects are copied recursively.
 */
export function jsonSafe(value) {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, jsonSafe(inner)]))
  }
  if (typeof value === 'function' || typeof value === 'symbol') return null
  return value
}

// Equality by value: object keys in sorted order, so { a, b } equals { b, a }; array order matters.
function canonical(value) {
  const safe = jsonSafe(value)
  const sortKeys = (inner) => {
    if (Array.isArray(inner)) return inner.map(sortKeys)
    if (inner !== null && typeof inner === 'object') {
      return Object.fromEntries(Object.keys(inner).sort().map((key) => [key, sortKeys(inner[key])]))
    }
    return inner
  }
  return JSON.stringify(sortKeys(safe))
}

export function sameValue(a, b) {
  return canonical(a) === canonical(b)
}

function sectionOf(request, section) {
  const value = request?.[section]
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * Every section field whose value differs between `before` and `after`, as
 * [{ field: 'section.field', oldValue, newValue }], in SECTIONS order then field name. Only section data
 * is compared — record metadata (status, assignment, sign-off, ...) is never a field change.
 */
export function fieldChanges(before, after) {
  const changes = []
  for (const section of SECTIONS) {
    const old = sectionOf(before, section)
    const next = sectionOf(after, section)
    const names = [...new Set([...Object.keys(old), ...Object.keys(next)])].sort()
    for (const name of names) {
      if (sameValue(old[name], next[name])) continue
      changes.push({ field: `${section}.${name}`, oldValue: jsonSafe(old[name]), newValue: jsonSafe(next[name]) })
    }
  }
  return changes
}

// --- Recording ------------------------------------------------------------------------------------

/**
 * The role under which this user may edit `section` of `request`: the first of their roles, in ROLES order,
 * that would permit the edit on its own. Derived from canEdit() for a single-role copy of the user, so it
 * follows shared/permissions.js exactly. Null if no role permits it.
 */
export function editingRole(user, request, section) {
  const held = rolesOf(user)
  return ROLES.find((role) => held.includes(role) && canEdit({ ...user, roles: [role] }, request, section)) ?? null
}

/**
 * The entries to record when `user` saves an edit that turns `before` into `after` — one per changed
 * field, without `at` (the store adds it in the same transaction as the write). None for a draft:
 * SPM-28 AC3, drafts are private working copies (Clarification 2) and record nothing.
 */
export function historyEntriesForEdit(user, before, after) {
  if (before?.status === DRAFT) return []
  return fieldChanges(before, after).map((change) => ({
    type: FIELD_CHANGED,
    ...change,
    actor: {
      type: 'user',
      uid: user.uid,
      name: user.name ?? null,
      role: editingRole(user, before, change.field.split('.')[0]),
    },
  }))
}

// --- Viewing --------------------------------------------------------------------------------------

/**
 * May this user view the request's change history? [Team decision, 4 Oct 2026, pending PO confirmation]
 * The assigned Event Coordinator and the owning Event Organiser only — not a same-organisation colleague,
 * an unassigned Coordinator, staff or Attendees.
 */
export function canViewChangeHistory(user, request) {
  return isAssignedCoordinator(user, request) || isOwningOrganiser(user, request)
}

function isInternal(entry) {
  return entry.field.split('.')[0] === INTERNAL
}

function newestFirst(a, b) {
  const byTime = String(b.at ?? '').localeCompare(String(a.at ?? ''))
  return byTime !== 0 ? byTime : String(a.field).localeCompare(String(b.field))
}

/**
 * The entries this user may see, newest first (one save's entries share a time and are then ordered by
 * field), each as { id, field, oldValue, newValue, actor: { type, name, role }, at } — the actor's uid is
 * never returned (SPM-46: an Organiser does not receive a Coordinator's uid). Null when the user may not
 * view the history at all.
 *
 * The Organiser sees every entry except changes to internal planning (SPM-28 AC6); internal planning is
 * never sent to them (SPM-42), so its history is not either.
 */
export function visibleChangeHistory(user, request, entries) {
  if (!canViewChangeHistory(user, request)) return null
  // The assigned Coordinator sees everything, including when they also own the event.
  const all = isAssignedCoordinator(user, request)
  return entries
    .filter((entry) => entry.type === FIELD_CHANGED && typeof entry.field === 'string')
    .filter((entry) => all || !isInternal(entry))
    .sort(newestFirst)
    .map(({ id, field, oldValue, newValue, actor, at }) => ({
      id: id ?? null,
      field,
      oldValue: jsonSafe(oldValue),
      newValue: jsonSafe(newValue),
      actor: { type: actor?.type ?? 'user', name: actor?.name ?? null, role: actor?.role ?? null },
      at: at ?? null,
    }))
}
