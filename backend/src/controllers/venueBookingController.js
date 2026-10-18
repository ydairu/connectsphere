import { listEventVenueBookings, listVenueBookingQueue, rejectVenueBooking, submitVenueBooking, VenueBookingError } from '../services/venueBookingService.js'
import { sendVenueError } from './venueController.js'

export function createVenueBookingController(getDb) {
  const handle = (operation, status = 200) => async (req, res, next) => {
    try { return res.status(status).json(await operation(req)) }
    catch (error) {
      if (error instanceof VenueBookingError) return res.status(error.status).json({ message: error.message })
      return sendVenueError(error, res, next)
    }
  }
  return {
    submit: handle(async (req) => ({ booking: await submitVenueBooking(req.params.id, req.body, req.user, getDb()) }), 201),
    decide: handle(async (req) => ({ booking: await rejectVenueBooking(req.params.id, req.params.bookingId, req.body, req.user, getDb()) })),
    list: handle((req) => listEventVenueBookings(req.params.id, req.user, getDb())),
    queue: handle((req) => listVenueBookingQueue(req.user, getDb())),
  }
}
