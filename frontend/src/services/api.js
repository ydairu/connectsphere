const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'

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
    throw new Error(response.status === 401 ? 'UNAUTHORIZED' : 'API_REQUEST_FAILED')
  }

  return response.json()
}

export function getApiProfile(user) {
  return authenticatedRequest(user, '/api/profile')
}

