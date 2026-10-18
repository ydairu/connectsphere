const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export function getVenueBookings(user, eventId) {
  return authenticatedRequest(user, `/api/requests/${eventId}/venue-bookings`)
}
export function submitVenueBooking(user, eventId, input) {
  return authenticatedRequest(user, `/api/requests/${eventId}/venue-bookings`, { method: 'POST', body: JSON.stringify(input) })
}
export function getVenueBookingQueue(user) {
  return authenticatedRequest(user, '/api/venues/booking-requests')
}
// SPM-17: the event's equipment requests, and submitting a new one.
export function listEquipmentRequests(user, eventId) {
  return authenticatedRequest(user, `/api/requests/${eventId}/equipment-requests`)
}
export function submitEquipmentRequest(user, eventId, input) {
  return authenticatedRequest(user, `/api/requests/${eventId}/equipment-requests`, { method: 'POST', body: JSON.stringify(input) })
}
// SPM-18: whether the request's equipment is available for its period, type by type.
export function checkEquipmentAvailability(user, eventId, equipmentRequestId) {
  return authenticatedRequest(user, `/api/requests/${eventId}/equipment-requests/${equipmentRequestId}/availability`)
}
// SPM-56: approve or re-confirm an equipment request (SPM-36 adds 'reject'), and the Technical Support queue.
// SPM-36: `details` carries a rejection's reason and suggested alternative.
export function decideEquipmentRequest(user, eventId, equipmentRequestId, action, details = {}) {
  return authenticatedRequest(user, `/api/requests/${eventId}/equipment-requests/${equipmentRequestId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ ...details, action }),
  })
}
export function listAssignedEquipmentRequests(user) {
  return authenticatedRequest(user, '/api/equipment/requests/assigned')
}

export class ApiRequestError extends Error {
  constructor(message, { status, details } = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

export async function authenticatedRequest(user, path, options = {}) {
  const token = await user.getIdToken()
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    let details = null
    try {
      details = await response.json()
    } catch {
      details = null
    }
    throw new ApiRequestError(response.status === 401 ? 'UNAUTHORIZED' : 'API_REQUEST_FAILED', {
      status: response.status,
      details,
    })
  }

  return response.json()
}

export function getApiProfile(user) {
  return authenticatedRequest(user, '/api/profile')
}

export function updateApiProfile(user, { organisationName }) {
  return authenticatedRequest(user, '/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({ organisationName }),
  })
}

export function createEventRequest(user, eventRequest) {
  return authenticatedRequest(user, '/api/event-requests', {
    method: 'POST',
    body: JSON.stringify(eventRequest),
  })
}

export function getEventRequest(user, id) {
  return authenticatedRequest(user, `/api/event-requests/${id}`)
}

export function updateEventRequest(user, id, eventRequest) {
  return authenticatedRequest(user, `/api/event-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(eventRequest),
  })
}

export function submitEventRequest(user, id) {
  return authenticatedRequest(user, `/api/event-requests/${id}/submit`, { method: 'POST' })
}

export function createVenue(user, venue) {
  return authenticatedRequest(user, '/api/venues', {
    method: 'POST',
    body: JSON.stringify(venue),
  })
}

export function getVenue(user, id) {
  return authenticatedRequest(user, `/api/venues/${id}`)
}

export function getVenueAvailability(user, id, { from, to }) {
  const search = new URLSearchParams({ from, to })
  return authenticatedRequest(user, `/api/venues/${id}/availability?${search}`)
}

export function createMaintenanceBlock(user, venueId, block) {
  return authenticatedRequest(user, `/api/venues/${venueId}/maintenance-blocks`, {
    method: 'POST',
    body: JSON.stringify(block),
  })
}

export function updateMaintenanceBlock(user, venueId, blockId, block) {
  return authenticatedRequest(user, `/api/venues/${venueId}/maintenance-blocks/${blockId}`, {
    method: 'PATCH',
    body: JSON.stringify(block),
  })
}

export function removeMaintenanceBlock(user, venueId, blockId) {
  return authenticatedRequest(user, `/api/venues/${venueId}/maintenance-blocks/${blockId}`, {
    method: 'DELETE',
  })
}

export function updateVenue(user, id, venue) {
  return authenticatedRequest(user, `/api/venues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(venue),
  })
}

// SPM-12: facility and accessibility repeat once per value; a venue must have every one of them.
export function listVenues(user, filters = {}) {
  const search = new URLSearchParams()
  if (filters.availableFrom) search.set('availableFrom', filters.availableFrom)
  if (filters.availableTo) search.set('availableTo', filters.availableTo)
  if (filters.attendance) search.set('attendance', String(filters.attendance))
  if (filters.location) search.set('location', filters.location)
  if (filters.layout) search.set('layout', filters.layout)
  for (const facility of filters.facilities ?? []) search.append('facility', facility)
  for (const feature of filters.accessibility ?? []) search.append('accessibility', feature)
  return authenticatedRequest(user, `/api/venues${search.size > 0 ? `?${search}` : ''}`)
}

// SPM-37: every equipment type with its total, available and unavailable unit counts, for an optional period.
export function listEquipment(user, { from, to } = {}) {
  const search = new URLSearchParams()
  if (from) search.set('from', from)
  if (to) search.set('to', to)
  return authenticatedRequest(user, `/api/equipment${search.size > 0 ? `?${search}` : ''}`)
}

export function createEquipmentType(user, equipmentType) {
  return authenticatedRequest(user, '/api/equipment', {
    method: 'POST',
    body: JSON.stringify(equipmentType),
  })
}

export function getEquipmentType(user, id) {
  return authenticatedRequest(user, `/api/equipment/${id}`)
}

export function addEquipmentUnit(user, equipmentTypeId, unit) {
  return authenticatedRequest(user, `/api/equipment/${equipmentTypeId}/units`, {
    method: 'POST',
    body: JSON.stringify(unit),
  })
}

export function updateEquipmentUnitStatus(user, equipmentTypeId, unitId, { status, note }) {
  return authenticatedRequest(user, `/api/equipment/${equipmentTypeId}/units/${unitId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  })
}

// SPM-42 list route: returns only the requests in the caller's scope, each reduced to the sections
// their roles may view. Drafts come back only to their owner, which is what SPM-24's page relies on.
export function listRequests(user) {
  return authenticatedRequest(user, '/api/requests')
}

// SPM-42 single request: the body carries only the sections this user may view, plus the sections
// they may edit right now.
export function getRequest(user, id) {
  return authenticatedRequest(user, `/api/requests/${id}`)
}

// Section-keyed patch, e.g. { venue: { layoutPreference: 'banquet' } }. A forbidden field comes back
// as 403 with forbiddenFields naming it.
export function updateRequest(user, id, patch) {
  return authenticatedRequest(user, `/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

// SPM-28: the event's field change history, newest first: { entries: [{ id, field, oldValue, newValue,
// actor: { type, name, role }, at }] }. Only the assigned Coordinator and the owning Organiser receive it
// (others get 403, or 404 for a Coordinator outside their scope); internal planning changes are left out
// for the Organiser.
// SPM-13: every catalogue venue checked against this event, for its assigned Coordinator while the event is
// Under Review or in Planning: { event, venues: [{ id, name, result, problems, warnings }], options }.
// Others get 403 (404 for a Coordinator outside their scope); another status gets 409.
export function getVenueSuitability(user, id) {
  return authenticatedRequest(user, `/api/event-requests/${id}/venue-suitability`)
}

export function getRequestHistory(user, id) {
  return authenticatedRequest(user, `/api/requests/${id}/history`)
}

// SPM-9 action, e.g. { action: 'start_review' } or { action: 'cancel', reason: '...' }. The response is
// shaped like getRequest's. A refused action comes back as 403 (not permitted), 400 (malformed, or a
// required reason missing) or 409 (not allowed in the request's current state), with a message.
// Missing requests and requests outside a coordinator's scope return 404.
export function transitionRequest(user, id, action, reason) {
  return authenticatedRequest(user, `/api/event-requests/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify(reason === undefined ? { action } : { action, reason }),
  })
}

// SPM-26: the Coordinators this event may be handed to, as { coordinators: [{ uid, name }] }. Only the
// event's assigned Coordinator receives it; anyone else gets the same refusals as reassignCoordinator.
export function getReassignmentCandidates(user, id) {
  return authenticatedRequest(user, `/api/event-requests/${id}/reassignment/candidates`)
}

// SPM-26: hand the event to another Coordinator. Returns { reassigned: true, coordinator: { name } }; the
// caller no longer has access to the event afterwards. Refusals: 404 (missing, or not the caller's event),
// 403 (not permitted), 400 (no agreement, or an invalid Coordinator) or 409 (completed, cancelled or
// rejected), each with a message.
export function reassignCoordinator(user, id, { coordinatorUid, handoverAgreed }) {
  return authenticatedRequest(user, `/api/event-requests/${id}/reassignment`, {
    method: 'POST',
    body: JSON.stringify({ coordinatorUid, handoverAgreed }),
  })
}

// SPM-47, SPM-63 — the signed-in user's own in-app notifications, newest first.
export function listNotifications(user) {
  return authenticatedRequest(user, '/api/notifications')
}

export function markNotificationRead(user, id) {
  return authenticatedRequest(user, `/api/notifications/${id}/read`, { method: 'POST' })
}
