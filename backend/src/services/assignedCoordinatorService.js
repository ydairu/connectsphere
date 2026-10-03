// SPM-46 — loads the assigned Coordinator's display name for an Organiser's view of an event.
//
// Who may see it is decided by shared/assignedCoordinator.js; this file only reads users/{uid}. Nothing is
// read for any other user, for drafts, or for an event with no Coordinator yet. Only `name` leaves this
// function — the rest of the profile (email, roles, ...) is never returned.

import { coordinatorUidToLookUp } from '../../../shared/assignedCoordinator.js'

export const USERS_COLLECTION = 'users'

/**
 * @param {() => object} getUserDb  returns the Firestore-shaped database holding users/{uid}
 * @returns {(user, request) => Promise<string|null>}  the name, or null when there is none to show.
 *   A failed read is logged and yields null, so the event still loads and the name shows as unavailable.
 */
export function createCoordinatorNameLoader(getUserDb) {
  return async function loadCoordinatorName(user, request) {
    const uid = coordinatorUidToLookUp(user, request)
    if (!uid) return null
    try {
      const snapshot = await getUserDb().collection(USERS_COLLECTION).doc(uid).get()
      if (!snapshot.exists) return null
      const { name } = snapshot.data() ?? {}
      return typeof name === 'string' ? name : null
    } catch (error) {
      console.error(`SPM-46: could not load the assigned Coordinator's name for ${request.id}`, error)
      return null
    }
  }
}
