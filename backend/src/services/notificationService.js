// In-app notifications — SPM-47, SPM-63. Which notifications an action produces is decided by
// shared/notifications.js; this file writes them and serves each user their own.
//
// Notifications live in the top-level `notifications` collection, one document per recipient. The browser
// never reads it directly: firestore.rules denies every collection it does not name, so the only way in is
// GET /api/notifications, which returns the signed-in user's own notifications and nobody else's.

import { NOTIFICATIONS_COLLECTION } from '../../../shared/notifications.js'

export class NotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found')
    this.name = 'NotificationNotFoundError'
  }
}

/** Adds `notifications` within `tx`. Write-only: call after all reads. */
export function addNotifications(tx, db, notifications) {
  for (const notification of notifications) {
    tx.set(db.collection(NOTIFICATIONS_COLLECTION).doc(), notification)
  }
}

function present(snapshot) {
  const { recipientUid: _recipient, ...notification } = snapshot.data()
  return { id: snapshot.id, ...notification }
}

/** The user's notifications, newest first. The uid comes from the verified token, never the client. */
export async function listNotifications(db, uid) {
  const snapshot = await db.collection(NOTIFICATIONS_COLLECTION).where('recipientUid', '==', uid).get()
  return snapshot.docs.map(present).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

/**
 * Marks one of the user's notifications read and returns it. Someone else's notification gets the same
 * refusal as a missing one, so its existence is not confirmed.
 */
export async function markNotificationRead(db, uid, id, now = new Date()) {
  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc(id)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data().recipientUid !== uid) throw new NotificationNotFoundError()
  if (snapshot.data().readAt == null) await ref.update({ readAt: now.toISOString() })
  return present(await ref.get())
}
