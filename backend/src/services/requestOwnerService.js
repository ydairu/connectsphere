// SPM-64 follow-up — loads request owners' display names for an Organiser's view of requests.
//
// Which owners may be named is decided by shared/requestOwner.js; this file only reads users/{uid}, once per
// distinct owner. Only `name` leaves this function. A failed read is logged and yields no name, so the list
// or the event still loads.

import { ownerUidsToLookUp } from '../../../shared/requestOwner.js'
import { USERS_COLLECTION } from './assignedCoordinatorService.js'

/**
 * @param {() => object} getUserDb  returns the Firestore-shaped database holding users/{uid}
 * @returns {(user, requests) => Promise<Map<string, string|null>>}  names by owner uid
 */
export function createOwnerNameLoader(getUserDb) {
  return async function loadOwnerNames(user, requests) {
    const uids = ownerUidsToLookUp(user, requests)
    const names = new Map()
    if (uids.length === 0) return names
    await Promise.all(
      uids.map(async (uid) => {
        try {
          const snapshot = await getUserDb().collection(USERS_COLLECTION).doc(uid).get()
          const name = snapshot.exists ? snapshot.data()?.name : null
          names.set(uid, typeof name === 'string' ? name : null)
        } catch (error) {
          console.error('SPM-64: could not load a request owner\'s name', error)
          names.set(uid, null)
        }
      }),
    )
    return names
  }
}
