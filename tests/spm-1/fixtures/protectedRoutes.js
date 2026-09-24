// SPM-1 access matrix: which pages and API endpoints require sign-in, and which additionally require
// a role. Mirrors frontend/src/App.jsx and the backend route files; the tests fail if they drift.

import { ORGANISER } from '../../../shared/permissions.js'

export const PROTECTED_PAGES = Object.freeze([
  { path: '/profile', allowedRoles: null, heading: 'Profile' },
  { path: '/requests', allowedRoles: null },
  { path: '/requests/seed-req-a1-submitted', allowedRoles: null },
  { path: '/requests/drafts', allowedRoles: [ORGANISER], heading: 'Saved drafts' },
  { path: '/event-requests/new', allowedRoles: [ORGANISER], heading: 'Create Event Request' },
  { path: '/event-requests/seed-req-a1-draft/edit', allowedRoles: [ORGANISER], heading: 'Edit Draft Event Request' },
])

export const ORGANISER_ONLY_PAGES = Object.freeze(PROTECTED_PAGES.filter((page) => page.allowedRoles))

export const PUBLIC_PAGES = Object.freeze(['/', '/login', '/register'])

// A minimal valid draft: SPM-7 allows drafts to be incomplete.
export const DRAFT_BODY = Object.freeze({ core: { title: 'Team offsite' } })

export const PROTECTED_ENDPOINTS = Object.freeze([
  { method: 'get', path: '/api/profile', allowedRoles: null },
  { method: 'patch', path: '/api/profile', allowedRoles: [ORGANISER], body: { organisationName: 'Renamed Org' } },
  { method: 'post', path: '/api/event-requests', allowedRoles: [ORGANISER], body: DRAFT_BODY },
  { method: 'get', path: '/api/event-requests/seed-req-a1-draft', allowedRoles: [ORGANISER] },
  { method: 'get', path: '/api/requests', allowedRoles: null },
  { method: 'get', path: '/api/requests/seed-req-a1-submitted', allowedRoles: null },
])

export const ORGANISER_ONLY_ENDPOINTS = Object.freeze(
  PROTECTED_ENDPOINTS.filter((endpoint) => endpoint.allowedRoles && endpoint.method !== 'get'),
)
