import { primaryVenueHistoryEntry } from '../../../shared/changeHistory.js'

export function recordPrimaryVenueChange(tx, eventRef, before, after, actor, at) {
  if (before?.bookingId === after?.bookingId) return
  tx.set(eventRef.collection('activity').doc(), { ...primaryVenueHistoryEntry(before, after, actor), at })
}
