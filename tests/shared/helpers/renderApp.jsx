// Renders the whole application (router, real AuthProvider, all routes) at a given URL, the way a user
// arrives by typing an address. Firebase is the in-memory fake from tests/shared/setup/jsdom.setup.js.

import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import App from '../../../frontend/src/App.jsx'
import { AuthProvider } from '../../../frontend/src/context/AuthContext.jsx'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

export function renderApp(initialPath = '/') {
  const entry = typeof initialPath === 'string' ? { pathname: initialPath } : initialPath
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationProbe />
    </MemoryRouter>,
  )
}

export function currentPath() {
  return screen.getByTestId('current-path').textContent
}

// The pages behind protected routes load data from the Express API. Tests of authentication and
// routing stub that API so the pages render their empty states; the API itself is tested with Supertest.
export function stubApi({ requests = [] } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const path = new URL(url, 'http://localhost').pathname
    let body = {}
    if (path.startsWith('/api/requests')) {
      body = { requests }
    } else if (path.startsWith('/api/event-requests/')) {
      const id = path.split('/').pop()
      body = { eventRequest: { id, status: 'draft', core: {}, venue: {}, equipment: {}, registration: {} } }
    }
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const LOGIN_HEADING = 'Welcome back'
export const FORBIDDEN_HEADING = 'You do not have access to this page'
