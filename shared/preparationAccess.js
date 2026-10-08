// SPM-48 — what the request page needs to explain a preparation section to the staff who edit it.
//
// Pure functions: no Firebase, no I/O. Separate from shared/preparation.js because it needs
// shared/permissions.js, which imports preparation.js.

import { canEdit, editableSections, inScopeAs, rolesOf } from './permissions.js'
import { PREPARATION_SECTIONS, preparationReadOnlyReason, preparationShown } from './preparation.js'

/**
 * For each preparation section shown to this user through a staff role that edits it:
 * { editable, readOnlyReason }, where readOnlyReason comes from preparationReadOnlyReason() — the same
 * condition the server enforces. Null when there is none, e.g. for a Coordinator, who views preparation
 * read-only as part of the event, or an Organiser, who never receives it.
 */
export function preparationEditing(user, request) {
  if (!preparationShown(request)) return null
  const result = {}
  for (const section of PREPARATION_SECTIONS) {
    const editsAs = rolesOf(user).some((role) => editableSections([role]).includes(section) && inScopeAs(role, user, request))
    if (!editsAs) continue
    const editable = canEdit(user, request, section)
    result[section] = { editable, readOnlyReason: editable ? null : preparationReadOnlyReason(section, request) }
  }
  return Object.keys(result).length > 0 ? result : null
}
