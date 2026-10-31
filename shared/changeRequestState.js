// SPM-20 / SPM-40 — an event's change requests as recorded on it: the read the lifecycle rules need, with no imports.
//
// Split out of shared/changeRequests.js so shared/statusTransitions.js and shared/safetyReview.js can read it without
// a circular import: changeRequests.js imports significantChanges.js, which reaches statusTransitions.js through
// notifications.js. `significant` is stored on the request when it is submitted, for the same reason.

export const CHANGE_PENDING = 'pending'

// Refused because a significant change request is waiting for the Coordinator's decision.
export const SIGNIFICANT_CHANGE_REQUEST_PENDING = 'significant_change_request_pending'

/** The current request (the latest), or null. */
export function currentChangeRequest(event) {
  const requests = Array.isArray(event?.changeRequests) ? event.changeRequests : []
  return requests.at(-1) ?? null
}

/**
 * Is a significant change request waiting for the Coordinator's decision? [Team decision pending — SPM-40] Confirm and
 * submission for the safety check wait for it, so the event is not reviewed or confirmed on details about to change.
 * An ordinary request, or one returned to the Organiser, blocks nothing.
 */
export function significantChangeRequestPending(event) {
  const current = currentChangeRequest(event)
  return current?.status === CHANGE_PENDING && current.significant === true
}
