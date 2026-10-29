// SPM-41 — the event's registered Attendees, for the notices sent when it is cancelled or rescheduled. Only active
// registrations count (shared/registration.js): SPM-39's waitlisted and SPM-59's withdrawn Attendees are not
// registered for the event. Kept apart from registrationService.js, which imports statusTransitionService.js, so
// the status-change transaction can use it without an import cycle. SPM-39 and SPM-59 can reuse it.

import { REGISTRATIONS_COLLECTION, isActiveRegistration } from '../../../shared/registration.js'

/** The uids of event `eventId`'s registered Attendees. Reads inside `tx` when one is given: call before any write. */
export async function loadRegisteredAttendeeUids(db, eventId, tx = null) {
  const query = db.collection(REGISTRATIONS_COLLECTION).where('eventRequestId', '==', eventId)
  const snapshot = tx ? await tx.get(query) : await query.get()
  return snapshot.docs.map((doc) => doc.data()).filter(isActiveRegistration).map((registration) => registration.attendeeUid)
}
