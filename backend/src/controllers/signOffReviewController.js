import { presentRequest } from '../middleware/authorise.js'
import { loadVenueBookingState } from '../services/primaryVenueService.js'
import { decideSignOffReview } from '../services/signOffReviewService.js'
import { sendEventRequestError } from './eventRequestController.js'

// SPM-87 — POST /api/requests/:id/sign-off-review, body { reapprove: [itemKey, ...] }. The response is shaped
// like GET /api/requests/:id. Errors map as for event actions (sendEventRequestError): not the assigned
// Coordinator → 403 (404 for another Coordinator), nothing to decide → 409, an invalid choice → 400.
export function createSignOffReviewController(getDb) {
  return {
    async decide(req, res, next) {
      try {
        const event = await decideSignOffReview(req.params.id, req.body, req.user, getDb())
        const bookingState = await loadVenueBookingState(req.params.id, event, getDb())
        return res.json(presentRequest(req.user, event, bookingState))
      } catch (error) {
        return sendEventRequestError(error, res, next)
      }
    },
  }
}
