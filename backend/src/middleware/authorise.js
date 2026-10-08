// SPM-42 — record, section and status authorisation for event requests. Runs after `authenticate`.
//
// Every decision here is delegated to shared/permissions.js: inScope() for "may this user see the
// record", projectRequest() for what they receive, forbiddenFields() and canEdit() for what they may
// change. Do NOT rebuild an edit decision from inScope() && stateGateOpen() — both are any-role
// predicates, and combining them lets one role's open gate unlock another role's sections (the
// multi-role leak; CLAUDE.md, "Evaluate per role, then union the results").

import { COORDINATOR, SECTIONS, canEdit, forbiddenFields, inScope, projectRequest, rolesOf } from '../../../shared/permissions.js'
import { canReassignCoordinator } from '../../../shared/coordinatorReassignment.js'
import { assignedCoordinatorSummary } from '../../../shared/assignedCoordinator.js'
import { canViewChangeHistory, visibleChangeHistory } from '../../../shared/changeHistory.js'
import { requestOwnerFields } from '../../../shared/requestOwner.js'
import { preparationEditing } from '../../../shared/preparationAccess.js'
import {
  allAvailableActions,
  arrangementsSummary,
  cancellationNotice,
  cancellationSummary,
  clarificationSummary,
  completionNotice,
  rejectionNotice,
} from '../../../shared/requestActions.js'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function forbidden(res) {
  // Logged in but not permitted: 403, never a redirect to login (CLAUDE.md, Repo-specific rules).
  return res.status(403).json({ message: 'Forbidden' })
}

/**
 * The refusal for a record outside the user's scope. A coordinator gets the same 404 as for an id that
 * does not exist, so another coordinator's event is not confirmed to exist (SPM-65). Every other role
 * keeps SPM-42's 403.
 */
function outOfScope(user, res) {
  if (rolesOf(user).includes(COORDINATOR)) return res.status(404).json({ message: 'Not found' })
  return forbidden(res)
}

/**
 * The response body for one request: what this user may view of it, and which sections they may edit
 * right now. `editableSections` lets the UI render read-only sections without re-deriving the rule —
 * the projected record deliberately omits ownerUid and assignedStaffUids, so the client cannot.
 * `availableActions` (SPM-9) lists the actions this user may take now, for the same reason. `arrangements`
 * and `cancellationRequest` (SPM-9) summarise sign-off and any cancellation request for users who may see
 * them, without the internal record of who decided. `clarificationRequests` (SPM-25) lists the
 * Coordinator's return messages, newest first, on the same terms. `assignedCoordinator` (SPM-46) is the
 * assigned Coordinator's display name for an Organiser who may view the event, and null for everyone else;
 * `coordinatorName` is what services/assignedCoordinatorService.js loaded from users/{uid}.
 * `cancellation` (SPM-63) gives a Cancelled event's reason and time to every user it is presented to.
 * `rejection` (SPM-45) does the same for a Rejected request, and `completion` (SPM-27) gives when a
 * Completed event was marked complete, and by whom to Coordinators. `canViewChangeHistory` (SPM-28) says
 * whether this user may read GET /api/requests/:id/history. `ownerName` and `isOwnRequest` (SPM-64
 * follow-up) tell an Organiser who submitted the request; they are absent for every other role, and no uid
 * is sent. `ownerNames` is what services/requestOwnerService.js loaded from users/{uid}.
 * `preparation` (SPM-48) says, for each preparation section this user's staff role edits, why it is
 * read-only now (or null), so the page can explain it: the projected record carries no sign-off for staff.
 */
export function presentRequest(user, request, { coordinatorName = null, ownerNames } = {}) {
  return {
    request: projectRequest(user, request),
    editableSections: SECTIONS.filter((section) => canEdit(user, request, section)),
    availableActions: allAvailableActions(user, request),
    arrangements: arrangementsSummary(user, request),
    cancellationRequest: cancellationSummary(user, request),
    clarificationRequests: clarificationSummary(user, request),
    canReassignCoordinator: canReassignCoordinator(user, request),
    assignedCoordinator: assignedCoordinatorSummary(user, request, coordinatorName),
    cancellation: cancellationNotice(user, request),
    rejection: rejectionNotice(user, request),
    completion: completionNotice(user, request),
    canViewChangeHistory: canViewChangeHistory(user, request),
    preparation: preparationEditing(user, request),
    ...requestOwnerFields(user, request, ownerNames),
  }
}

/**
 * List: records out of scope are dropped, the rest are projected. Drafts never reach anyone but their
 * owner — SPM-24's last criterion falls out of inScope(), not out of a status filter here.
 */
export function authoriseList(req, res, next) {
  // SPM-64 follow-up: an Organiser's items also say who submitted them (shared/requestOwner.js).
  res.locals.requests = req.eventRequests
    .filter((request) => inScope(req.user, request))
    .map((request) => ({ ...projectRequest(req.user, request), ...requestOwnerFields(req.user, request, req.ownerNames) }))
  return next()
}

/**
 * Read by id: denied when out of scope, so a direct link or API call to someone else's record gets
 * nothing (SPM-42 criteria 1–2). Sections the user may not view are absent from the body, not hidden.
 */
export function authoriseRead(req, res, next) {
  if (!inScope(req.user, req.eventRequest)) return outOfScope(req.user, res)
  res.locals.body = presentRequest(req.user, req.eventRequest, { coordinatorName: req.assignedCoordinatorName, ownerNames: req.ownerNames })
  return next()
}

/**
 * SPM-28 change history: the assigned Coordinator and the owning Organiser only. Out of scope gets
 * SPM-42/SPM-65's refusal (404 for anyone holding the Coordinator role, 403 otherwise); a user who may see
 * the event but not its history — a same-organisation colleague, assigned staff — gets 403.
 */
export function authoriseHistory(req, res, next) {
  if (!inScope(req.user, req.eventRequest)) return outOfScope(req.user, res)
  if (!canViewChangeHistory(req.user, req.eventRequest)) return forbidden(res)
  return next()
}

/** Sends the entries this user may see, newest first, with no actor uid (shared/changeHistory.js). */
export function sendHistory(req, res) {
  res.json({ entries: visibleChangeHistory(req.user, req.eventRequest, req.fieldHistory ?? []) })
}

/**
 * Write: a section-keyed patch, e.g. { venue: { layoutPreference: 'banquet' } }. Any field the user may
 * not change on this record right now is rejected with 403 naming every such field (SPM-42 criterion 7).
 * The whole patch is refused — permitted fields in the same patch are not partially applied.
 */
export function authoriseWrite(req, res, next) {
  const { user, eventRequest } = req
  const patch = req.body

  // No field names for a record the user cannot see: naming them would confirm what it contains.
  if (!inScope(user, eventRequest)) return outOfScope(user, res)

  if (!isPlainObject(patch) || Object.keys(patch).length === 0) {
    return res.status(400).json({ message: 'Expected a JSON object of sections to update' })
  }

  const fields = forbiddenFields(user, eventRequest, patch)
  if (fields.length > 0) {
    return res.status(403).json({ message: `Forbidden: you may not edit ${fields.join(', ')}`, forbiddenFields: fields })
  }

  // Every key is now a section this user may edit. Each must carry at least one field to set.
  const malformed = Object.keys(patch).filter((section) => !isPlainObject(patch[section]) || Object.keys(patch[section]).length === 0)
  if (malformed.length > 0) {
    return res.status(400).json({ message: `Expected an object of fields for ${malformed.join(', ')}` })
  }

  return next()
}
