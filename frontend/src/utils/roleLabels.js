import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

// Display names for the five customer roles (effective-requirements.md, Roles and Accounts).
const ROLE_LABELS = {
  [ORGANISER]: 'Event Organiser',
  [COORDINATOR]: 'Event Coordinator',
  [VENUE_STAFF]: 'Venue Staff',
  [TECHNICAL_STAFF]: 'Technical Support Staff',
  [ATTENDEE]: 'Attendee',
}

// An unrecognised value is shown as stored rather than mislabelled as some other role.
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role
}
