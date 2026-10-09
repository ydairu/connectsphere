// SPM-10 — who is notified of a significant change: the users in the event's assignedStaffUids who hold the
// Venue Staff or Technical Support Staff role, never the user who made the change.
//
// Reads users/{uid} once per assigned uid, before the save transaction; the transaction's version check
// ensures the assignment it was read for is the one saved. A failed or missing profile is skipped and
// logged, so a notification problem never blocks the edit.

import { TECHNICAL_STAFF, VENUE_STAFF, rolesOf } from '../../../shared/permissions.js'
import { mayNotifyStaff } from '../../../shared/significantChanges.js'
import { USERS_COLLECTION } from './assignedCoordinatorService.js'

const STAFF_ROLES = [VENUE_STAFF, TECHNICAL_STAFF]

/**
 * @param {() => object} getUserDb  returns the Firestore-shaped database holding users/{uid}
 * @returns {(user, request, patch) => Promise<string[]>}  recipient uids
 */
export function createStaffRecipientLoader(getUserDb) {
  return async function loadStaffRecipients(user, request, patch) {
    if (!mayNotifyStaff(request, patch)) return []
    const uids = [...new Set(request.assignedStaffUids ?? [])].filter((uid) => uid && uid !== user?.uid)
    const recipients = await Promise.all(
      uids.map(async (uid) => {
        try {
          const snapshot = await getUserDb().collection(USERS_COLLECTION).doc(uid).get()
          const roles = snapshot.exists ? rolesOf(snapshot.data()) : []
          return roles.some((role) => STAFF_ROLES.includes(role)) ? uid : null
        } catch (error) {
          console.error('SPM-10: could not load an assigned staff profile', error)
          return null
        }
      }),
    )
    return recipients.filter(Boolean)
  }
}
