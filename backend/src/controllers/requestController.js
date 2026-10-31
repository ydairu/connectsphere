// Event request handlers — load, send, update. Authorisation is not decided here: every response body is
// produced by authorise.js. Create, submit and draft-save belong to SPM-7, SPM-3 and SPM-4.

import { attendeeChangeNotifications } from '../../../shared/notifications.js'
import { eventRescheduled } from '../../../shared/registration.js'
import { loadRegisteredAttendeeUids } from '../services/registeredAttendees.js'
import { COORDINATOR, rolesOf } from '../../../shared/permissions.js'
import { historyEntriesForEdit } from '../../../shared/changeHistory.js'
import { SIGNIFICANT_CHANGE, significantChangeEffects, significantFieldsIn } from '../../../shared/significantChanges.js'
import { MARKING_STATUSES } from '../../../shared/signOffReview.js'
import { presentRequest } from '../middleware/authorise.js'
import { StaleWriteError } from '../services/eventRequestStore.js'
import { STATUS_CHANGED, userActor } from '../services/statusHistory.js'
import { loadEventPreparationReadiness, loadEventVenueBookings, loadVenueBookingReadiness } from '../services/venueBookingService.js'

function newestFirst(a, b) {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
}

// SPM-41: the fields whose change reschedules the event (shared/registration.js, eventRescheduled).
function mayReschedule(patch) {
  return Object.hasOwn(patch?.core ?? {}, 'preferredDateTime') || Object.hasOwn(patch?.core ?? {}, 'durationHours')
}

// loadCoordinatorName (SPM-46) comes from services/assignedCoordinatorService.js and reads users/{uid} only
// for an Organiser who may see the assigned Coordinator. loadOwnerNames (SPM-64 follow-up) comes from
// services/requestOwnerService.js and reads only the owners an Organiser may see named. loadStaffRecipients
// (SPM-10) comes from services/staffRecipientService.js and reads the assigned staff's roles only when a
// significant change could notify them.
export function createRequestController(store, loadCoordinatorName, loadOwnerNames = async () => new Map(), loadStaffRecipients = async () => [], getDb = null) {
  return {
    async loadAll(req, _res, next) {
      // SPM-65: a coordinator-only user is served by a query on assignedCoordinatorUid, using the uid from
      // the verified token — nothing in the request can name another coordinator. Every other user, a
      // coordinator holding a second role included, gets the full list. Either way authoriseList's
      // inScope() filter makes the decision; the query only narrows what is read.
      const roles = rolesOf(req.user)
      const requests = roles.length === 1 && roles[0] === COORDINATOR
        ? await store.listAssignedToCoordinator(req.user.uid)
        : await store.list()
      req.eventRequests = requests.sort(newestFirst)
      return next()
    },

    async loadOne(req, res, next) {
      const found = await store.get(req.params.id)
      if (!found) return res.status(404).json({ message: 'Not found' })
      req.eventRequest = found.request
      req.eventRequestVersion = found.version
      return next()
    },

    // SPM-64 follow-up: runs before authoriseList / authoriseRead, which add the names to what they send.
    async loadOwnerNames(req, _res, next) {
      req.ownerNames = await loadOwnerNames(req.user, req.eventRequests ?? [req.eventRequest])
      return next()
    },

    // SPM-46: runs before authoriseRead, which puts the name in the body only if the user may see it.
    async loadAssignedCoordinatorName(req, _res, next) {
      req.assignedCoordinatorName = await loadCoordinatorName(req.user, req.eventRequest)
      return next()
    },

    sendList(_req, res) {
      res.json({ requests: res.locals.requests })
    },

    sendOne(_req, res) {
      res.json(res.locals.body)
    },

    // SPM-28: runs after authoriseHistory has allowed the read; visibleChangeHistory() decides the entries.
    async loadFieldHistory(req, _res, next) {
      req.fieldHistory = await store.listFieldHistory(req.params.id)
      return next()
    },

    async update(req, res) {
      try {
        const staffRecipientUids = await loadStaffRecipients(req.user, req.eventRequest, req.body)
        // SPM-41: an edit that may move the event's date, time or duration loads its registered Attendees.
        const attendeeUids = getDb && mayReschedule(req.body) ? await loadRegisteredAttendeeUids(getDb(), req.params.id) : []
        // SPM-87: a significant change marks the approved venue bookings, so they are read before the save. A booking
        // decision writes the event too, so the save's version check refuses a decision made in between.
        const marking = MARKING_STATUSES.includes(req.eventRequest.status) && significantFieldsIn(req.body).length > 0
        const bookings = getDb && marking ? await loadEventVenueBookings(req.params.id, getDb()) : []
        const at = new Date().toISOString()
        // SPM-28: one field_changed entry per changed field, written in the same transaction as the edit.
        // SPM-10, SPM-87: in the same transaction, a significant change at Planning, Confirmed or Preparation marks
        // the sign-offs "Changed since approval", moves a Confirmed or Preparation event back to Planning (with its
        // status_changed entry), withdraws the safety approval and notifies the staff.
        const { request } = await store.update(req.params.id, req.body, {
          version: req.eventRequestVersion,
          recordChanges: (before, after) => historyEntriesForEdit(req.user, before, after),
          consequences: (before, after) => {
            const { metadata, statusChange, notifications } = significantChangeEffects(req.user, before, after, { at, staffRecipientUids, bookings })
            const activity = statusChange
              ? [{ type: STATUS_CHANGED, action: SIGNIFICANT_CHANGE, ...statusChange, actor: userActor(req.user), at, reason: SIGNIFICANT_CHANGE }]
              : []
            // SPM-41: a new date, time or duration notifies every registered Attendee, in the same transaction.
            const attendees = eventRescheduled(before, after)
              ? attendeeChangeNotifications('rescheduled', before, after, req.user, { attendeeUids, at })
              : []
            return { metadata, activity, notifications: [...notifications, ...attendees] }
          },
        })
        const coordinatorName = await loadCoordinatorName(req.user, request)
        const ownerNames = await loadOwnerNames(req.user, [request])
        const venueBookingReadiness = getDb ? await loadVenueBookingReadiness(req.params.id, getDb()) : null
        const eventPreparationReadiness = getDb ? await loadEventPreparationReadiness(req.params.id, request, getDb()) : null
        return res.json(presentRequest(req.user, request, { coordinatorName, ownerNames, venueBookingReadiness, eventPreparationReadiness }))
      } catch (error) {
        if (error instanceof StaleWriteError) {
          return res.status(409).json({ message: 'This request changed since it was loaded. Reload and try again.' })
        }
        throw error
      }
    },
  }
}
