import { ATTENDEE, COORDINATOR, COORDINATOR_LEAD, ORGANISER, SAFETY_OFFICER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

// Wording for the requests page. The page, its data and its permission rules are identical for every
// role — only the words differ, because the same list means different things to each of them: the
// events they coordinate to a coordinator (SPM-65), assigned work to staff, their organisation's
// requests to an organiser, and open events to an attendee.
//
// A user may hold several roles (SPM-42), so one wording has to be chosen. Precedence puts internal
// roles first: coordinator, then staff, then organiser, then attendee. The permissions themselves are
// still the union of all their roles — this only decides the heading. A Lead who is also a Coordinator keeps
// the Coordinator heading; their queue is on its own page (SPM-68).
const COPY = {
  [COORDINATOR]: {
    eyebrow: 'Coordination',
    title: 'Events assigned to you',
    description: 'Submitted events you are the assigned coordinator for, with their current status.',
    emptyTitle: 'No events assigned to you yet',
    emptyBody: 'Events appear here once a submitted request is assigned to you.',
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
  // SPM-66: the Safety Officer's list is the safety-review queue — inScope() admits only queued events.
  [SAFETY_OFFICER]: {
    eyebrow: 'Safety review',
    title: 'Safety-review queue',
    description: 'Events awaiting an operational safety check. An event leaves the queue once its review is recorded.',
    emptyTitle: 'No events awaiting a safety check',
    emptyBody: 'Events appear here when their coordinator submits them for safety review.',
  },
  // SPM-68: the unassigned queue; assigning happens on /requests/unassigned. SPM-69: plus the active events the
  // Lead assigned or reassigned, and those assigned before SPM-68 — inScope() decides — which are reassigned from
  // the event page. A plain list: filtering and per-Coordinator counts are SPM-70's.
  [COORDINATOR_LEAD]: {
    eyebrow: 'Coordinator assignment',
    title: 'Requests you oversee',
    description: 'Submitted requests waiting for an Event Coordinator, and the active events you assigned. Assign from the Unassigned requests page; open an event to reassign it.',
    emptyTitle: 'Nothing to oversee',
    emptyBody: 'Requests appear here when an organiser submits them, and events stay here while they are active.',
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

const PRECEDENCE = [COORDINATOR, COORDINATOR_LEAD, SAFETY_OFFICER, VENUE_STAFF, TECHNICAL_STAFF, ORGANISER, ATTENDEE]

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
