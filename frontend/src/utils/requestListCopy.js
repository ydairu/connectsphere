import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

// Wording for the requests page. The page, its data and its permission rules are identical for every
// role — only the words differ, because the same list means different things to each of them: every
// request in the system to a coordinator, assigned work to staff, their organisation's requests to an
// organiser, and open events to an attendee.
//
// A user may hold several roles (SPM-42), so one wording has to be chosen. Precedence runs from the
// widest view to the narrowest: coordinator sees everything, staff see assigned events, organisers see
// their organisation, attendees see confirmed events. The permissions themselves are still the union
// of all their roles — this only decides the heading.
const COPY = {
  [COORDINATOR]: {
    eyebrow: 'Coordination',
    title: 'All event requests',
    description: 'Every submitted request, with its current status. Drafts stay private to their organiser until submitted.',
    emptyTitle: 'No requests yet',
    emptyBody: 'Requests appear here once Event Organisers submit them.',
  },
  [VENUE_STAFF]: {
    eyebrow: 'Assigned work',
    title: 'Events assigned to you',
    description: 'Events a coordinator has assigned to you, with their current status.',
    emptyTitle: 'Nothing assigned to you yet',
    emptyBody: 'Events appear here once a coordinator assigns you to them.',
  },
  [ORGANISER]: {
    eyebrow: 'Your requests',
    title: 'Event requests',
    description: "Your organisation's submitted requests, with their current status. These are not editable as drafts.",
    emptyTitle: 'No requests to show',
    emptyBody: 'Requests appear here once they are submitted.',
  },
  [ATTENDEE]: {
    eyebrow: 'Events',
    title: 'Events open to you',
    description: 'Events published to attendees, with their current status.',
    emptyTitle: 'No events to show',
    emptyBody: 'Confirmed events open for registration appear here.',
  },
}

// Venue and technical staff share wording: both see assigned events, and the dual-role account holds
// both. Their sections differ, which the detail page shows — not this list.
COPY[TECHNICAL_STAFF] = COPY[VENUE_STAFF]

const PRECEDENCE = [COORDINATOR, VENUE_STAFF, TECHNICAL_STAFF, ORGANISER, ATTENDEE]

const FALLBACK = {
  eyebrow: 'Your requests',
  title: 'Event requests',
  description: 'Requests you have access to, with their current status.',
  emptyTitle: 'No requests to show',
  emptyBody: 'Requests you have access to appear here.',
}

export function requestListCopy(roles = []) {
  const role = PRECEDENCE.find((candidate) => roles.includes(candidate))
  return COPY[role] ?? FALLBACK
}
