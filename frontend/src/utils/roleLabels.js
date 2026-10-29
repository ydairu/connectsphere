import { ATTENDEE, COORDINATOR, COORDINATOR_LEAD, ORGANISER, SAFETY_OFFICER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

// Display names for the customer roles (effective-requirements.md, Roles and Accounts), with the Week 7
// Safety Officer (SPM-66) and Event Coordinator Lead (SPM-68).
const ROLE_LABELS = {
  [ORGANISER]: 'Event Organiser',
  [COORDINATOR]: 'Event Coordinator',
  [VENUE_STAFF]: 'Venue Staff',
  [TECHNICAL_STAFF]: 'Technical Support Staff',
  [ATTENDEE]: 'Attendee',
  [SAFETY_OFFICER]: 'Safety Officer',
  [COORDINATOR_LEAD]: 'Event Coordinator Lead',
}

// An unrecognised value is shown as stored rather than mislabelled as some other role.
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role
}
