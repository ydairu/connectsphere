// SPM-2 registration payloads. Public self-registration is limited to Event Organiser and Attendee;
// the three internal staff roles must be rejected wherever they are attempted.

import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

export const PUBLIC_ROLES = Object.freeze([ORGANISER, ATTENDEE])
export const INTERNAL_ROLES = Object.freeze([COORDINATOR, VENUE_STAFF, TECHNICAL_STAFF])
export const INTERNAL_ROLE_LABELS = Object.freeze(['Event Coordinator', 'Venue Staff', 'Technical Support Staff'])

export const ATTENDEE_REGISTRATION = Object.freeze({
  name: 'Alex Attendee',
  email: 'alex.attendee@example.test',
  password: 'attendee-pass-1',
  role: ATTENDEE,
})

export const ORGANISER_REGISTRATION = Object.freeze({
  name: 'Olivia Organiser',
  email: 'olivia.organiser@example.test',
  password: 'organiser-pass-1',
  role: ORGANISER,
  organisationName: 'Example Events Ltd',
})

export function internalRoleRegistration(role) {
  return { ...ATTENDEE_REGISTRATION, email: `${role}@example.test`, role, organisationName: 'Staff Org' }
}

export const UNSUPPORTED_ACCOUNT_TYPES = Object.freeze([
  'admin',
  'ORGANISER',
  'Attendee',
  'organiser ',
  '',
  undefined,
  null,
  ['organiser'],
  { role: 'organiser' },
])
