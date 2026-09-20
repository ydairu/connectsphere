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

// SPM-42 list route: returns only the requests in the caller's scope, each reduced to the sections
// their roles may view. Drafts come back only to their owner, which is what SPM-24's page relies on.
export function listRequests(user) {
  return authenticatedRequest(user, '/api/requests')
}
