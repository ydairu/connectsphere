import { ATTENDEE, COORDINATOR, ORGANISER, SAFETY_OFFICER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

// Display names for the customer roles (effective-requirements.md, Roles and Accounts), with the Week 7
// Safety Officer (SPM-66).
const ROLE_LABELS = {
  [ORGANISER]: 'Event Organiser',
  [COORDINATOR]: 'Event Coordinator',
  [VENUE_STAFF]: 'Venue Staff',
  [TECHNICAL_STAFF]: 'Technical Support Staff',
  [ATTENDEE]: 'Attendee',
  [SAFETY_OFFICER]: 'Safety Officer',
}

// An unrecognised value is shown as stored rather than mislabelled as some other role.
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role
}
