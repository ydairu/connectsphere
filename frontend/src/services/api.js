const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'

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
