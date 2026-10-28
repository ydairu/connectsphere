import { decideSafetyReview, listSafetyVenueDetails } from '../services/safetyReviewService.js'
import { sendEventRequestError } from './eventRequestController.js'

// SPM-92 — POST /api/requests/:id/safety-review; SPM-66 — GET /api/requests/:id/safety-review/venues.
// Errors map as for event actions (sendEventRequestError): not a Safety Officer → 403, out of scope → 403 (404
// for a Coordinator), no longer awaiting review → 409, an invalid review → 400 with `errors`.
export function createSafetyReviewController(getDb) {
  return {
    // The event leaves the queue, and so the Safety Officer's scope, once the review is recorded, so the
    // response says only what was recorded (as SPM-26's reassignment does), not the projected event.
    async decide(req, res, next) {
      try {
        const event = await decideSafetyReview(req.params.id, req.body, req.user, getDb())
        return res.json({ recorded: true, outcome: event.safetyReview.outcome, safetyReviewStatus: event.safetyReview.status })
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },

    async listVenues(req, res, next) {
      try {
        return res.json(await listSafetyVenueDetails(req.params.id, req.user, getDb()))
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },
  }
}
