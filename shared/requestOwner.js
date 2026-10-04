// SPM-64 follow-up (AC4/AC6) — who submitted a request, as an Event Organiser sees it.
//
// Organisers see their own requests and their organisation's submitted requests (SPM-42; team decision of
// 3 Oct 2026, effective-requirements.md §3). To tell them apart, an Organiser receives the owner's display
// name and whether the request is their own. Nothing else about the owner is sent — never a uid — and no
// other role receives either field.
//
// Pure functions: the backend loads names from users/{uid} only for the uids ownerUidsToLookUp() returns.

import { ORGANISER, inScopeAs } from './permissions.js'

/** Does this user see who submitted this request? Only through the Organiser role, on a record it puts in scope. */
export function mayViewRequestOwner(user, request) {
  return inScopeAs(ORGANISER, user, request)
}

function isOwn(user, request) {
  return user?.uid != null && request.ownerUid === user.uid
}

/**
 * The owner uids whose users/{uid}.name must be loaded for this user's view of `requests`: colleagues'
 * requests the Organiser role puts in scope. The user's own name comes from their profile, so is not read.
 */
export function ownerUidsToLookUp(user, requests) {
  const uids = new Set()
  for (const request of requests) {
    if (request.ownerUid && mayViewRequestOwner(user, request) && !isOwn(user, request)) uids.add(request.ownerUid)
  }
  return [...uids]
}

function displayName(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * The fields added to a request for this user: { ownerName, isOwnRequest } for an Organiser who may see the
 * record, and {} for anyone else, so other roles' responses are unchanged.
 *
 * @param {Map<string, string|null>} ownerNames  users/{uid}.name by uid, from ownerUidsToLookUp()
 */
export function requestOwnerFields(user, request, ownerNames = new Map()) {
  if (!mayViewRequestOwner(user, request)) return {}
  if (isOwn(user, request)) return { ownerName: displayName(user.name), isOwnRequest: true }
  return { ownerName: displayName(ownerNames.get(request.ownerUid)), isOwnRequest: false }
}
