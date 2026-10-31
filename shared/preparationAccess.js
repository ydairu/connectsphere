// SPM-48 — what the request page needs to explain a preparation section to the staff who edit it.
//
// Pure functions: no Firebase, no I/O. Separate from shared/preparation.js because it needs
// shared/permissions.js, which imports preparation.js.

import { canEdit, editableSections, inScopeAs, rolesOf } from './permissions.js'
import { EQUIPMENT_PREPARATION, preparationReadOnlyReason, preparationShown } from './preparation.js'

export const PREPARATION_NOT_EVENT_ASSIGNEE = 'not_event_assignee'

/**
 * For each preparation section shown to this user through a staff role that edits it:
 * { editable, readOnlyReason }. The reason is the shared status condition or the SPM-71
 * event-assignee restriction. Null when there is none, e.g. for a Coordinator, who views
 * preparation read-only as part of the event, or an Organiser, who never receives it.
 */
export function preparationEditing(user, request) {
  if (!preparationShown(request)) return null
  const result = {}
  for (const section of [EQUIPMENT_PREPARATION]) {
    const editsAs = rolesOf(user).some((role) => editableSections([role]).includes(section) && inScopeAs(role, user, request))
    if (!editsAs) continue
    const editable = canEdit(user, request, section)
    const canonicalUid = request.assignedTechnicalStaffUid
    result[section] = { editable, readOnlyReason: editable ? null :
      canonicalUid && canonicalUid !== user.uid ? PREPARATION_NOT_EVENT_ASSIGNEE : preparationReadOnlyReason(section, request) }
  }
  return Object.keys(result).length > 0 ? result : null
}
