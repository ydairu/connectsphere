// Attendee registration — SPM-19.
//
// Pure functions: no Firebase, no I/O. backend/src/services/registrationService.js loads the event, its
// registrations and its approved venues, and asks this module whether an Attendee may register.
//
// Customer rules (effective-requirements.md §4.18; Clarification 1 §7, Clarification 2 §2):
//   - "Registration opening and closing dates are configured by the Event Organiser."
//   - "Registration is capped at the event/venue capacity." / "should not exceed venue capacity."
//   - A person must register to attend.
// SPM-88: registration is open while the event is Confirmed or Preparation (registrationEligibleStatus).
//
// Team decisions of 28 Oct 2026 (SPM-19, effective-requirements.md §4.18):
//   D2  the limit is the smaller of the Organiser's capacity and the largest approved venue's capacity,
//       worked out when someone registers (SPM-90's primary venue replaces "largest" once it exists);
//   D3  the registered list (name, email, time) goes to the owning Organiser and the assigned Coordinator only;
//   D5  an event moved back to Planning keeps its registrations but takes no new ones.

import { ATTENDEE, COORDINATOR, ORGANISER, inScopeAs, isAssignedCoordinator, rolesOf } from './permissions.js'
import { CANCELLED, COMPLETED, REJECTED, registrationEligibleStatus } from './status.js'

export const REGISTRATIONS_COLLECTION = 'eventRegistrations'

export const REGISTERED = 'registered'
// SPM-39 (W1, team decision of 29 Oct 2026): a waiting-list entry is the Attendee's registration record for the
// event with this status. It holds no place, so it is not active.
export const WAITLISTED = 'waitlisted'
export const ACTIVE_REGISTRATION_STATUSES = Object.freeze([REGISTERED])
// SPM-59: the rest of a registration record's life. Withdrawn (a registration or a waiting-list entry given up);
// invited (offered a freed place, X3: the place is held until the invitation expires); declined; and invitation
// expired. Only registered records are "registered"; registered records and open invitations hold places.
export const WITHDRAWN = 'withdrawn'
export const INVITED = 'invited'
export const DECLINED = 'declined'
export const INVITATION_EXPIRED = 'invitation_expired'
// X2 (team decision of 31 Oct 2026): how long an invitation lasts, unless registration closes or the event
// starts first.
export const INVITATION_HOURS = 48

// Why registration is unavailable, in the order they are checked.
export const NOT_ATTENDEE = 'not_attendee'
export const NOT_ENABLED = 'not_enabled'
export const WRONG_STATUS = 'wrong_status'
export const NOT_CONFIGURED = 'not_configured'
export const NOT_OPEN_YET = 'not_open_yet'
export const CLOSED = 'closed'
export const ALREADY_REGISTERED = 'already_registered'
export const FULL = 'full'
// SPM-39: why an Attendee cannot join the waiting list, beyond the reasons registration is unavailable.
export const NOT_FULL = 'not_full'
export const ALREADY_WAITLISTED = 'already_waitlisted'
// SPM-59: why an Attendee cannot withdraw, leave the waiting list or answer an invitation.
export const NOT_REGISTERED = 'not_registered'
export const WITHDRAWAL_NOT_ALLOWED = 'withdrawal_not_allowed'
export const WITHDRAWAL_CLOSED = 'withdrawal_closed'
export const EVENT_STARTED = 'event_started'
export const EVENT_CLOSED = 'event_closed'
export const NOT_WAITLISTED = 'not_waitlisted'
export const NO_INVITATION = 'no_invitation'
export const INVITATION_OPEN = 'invitation_open'

export const UNAVAILABLE_MESSAGES = Object.freeze({
  [NOT_ATTENDEE]: 'Only Attendees can register for events.',
  [NOT_ENABLED]: 'Registration is not enabled for this event.',
  [WRONG_STATUS]: 'Registration is open only while the event is confirmed.',
  [NOT_CONFIGURED]: 'The organiser has not set the registration period and capacity yet.',
  [NOT_OPEN_YET]: 'Registration has not opened yet.',
  [CLOSED]: 'Registration has closed.',
  [ALREADY_REGISTERED]: 'You are already registered for this event.',
  [FULL]: 'This event is full.',
  [NOT_FULL]: 'Places are still available. Register instead.',
  [ALREADY_WAITLISTED]: 'You are already on the waiting list for this event.',
  [NOT_REGISTERED]: 'You are not registered for this event.',
  [WITHDRAWAL_NOT_ALLOWED]: 'The organiser does not allow withdrawal from this event.',
  [WITHDRAWAL_CLOSED]: 'Withdrawal from this event has closed.',
  [EVENT_STARTED]: 'The event has started, so you can no longer withdraw.',
  [EVENT_CLOSED]: 'This event is closed.',
  [NOT_WAITLISTED]: 'You are not on the waiting list for this event.',
  [NO_INVITATION]: 'You have no open invitation for this event.',
  [INVITATION_OPEN]: 'You have been offered a place. Accept your invitation instead.',
  [INVITATION_EXPIRED]: 'Your invitation has expired and the place has passed on.',
})

/** The document id of `uid`'s registration for event `eventId`: one per Attendee per event. */
export function registrationId(eventId, uid) {
  return `${eventId}_${uid}`
}

function time(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null
}

// --- Settings -------------------------------------------------------------------------------------

/**
 * Field errors for an event's registration settings, keyed like normaliseEventRequestInput ('registration.closesAt').
 * `registration` and `core` are the values as they will be saved. Values already in the wrong shape are
 * reported by normaliseEventRequestInput; this checks how they relate. `venueCapacity` is the largest approved
 * venue's capacity, or null when no venue is approved yet.
 */
export function registrationSettingsErrors(registration = {}, core = {}, venueCapacity = null) {
  const errors = {}
  const opensAt = time(registration.opensAt)
  const closesAt = time(registration.closesAt)
  const startsAt = time(core.preferredDateTime)
  if (opensAt !== null && closesAt !== null && opensAt >= closesAt) errors['registration.closesAt'] = 'Registration must close after it opens.'
  else if (closesAt !== null && startsAt !== null && closesAt > startsAt) errors['registration.closesAt'] = 'Registration must close by the event start.'
  // SPM-59 (X1): the Organiser's withdrawal cut-off, when set, is by the event start.
  const withdrawalClosesAt = time(registration.withdrawalClosesAt)
  if (withdrawalClosesAt !== null && startsAt !== null && withdrawalClosesAt > startsAt) errors['registration.withdrawalClosesAt'] = 'Withdrawal must close by the event start.'
  const capacity = positiveInteger(registration.capacity)
  if (capacity !== null && venueCapacity !== null && capacity > venueCapacity) {
    errors['registration.capacity'] = `Capacity cannot be more than the venue capacity (${venueCapacity}).`
  }
  return errors
}

// --- Capacity -------------------------------------------------------------------------------------

/** D2: the largest maximumCapacity of the approved venues, or null when there is none. */
export function venueCapacityOf(venues = []) {
  const capacities = venues.map((venue) => positiveInteger(venue?.maximumCapacity)).filter((value) => value !== null)
  return capacities.length > 0 ? Math.max(...capacities) : null
}

/** D2: the smaller of the Organiser's capacity and the venue capacity; whichever is known; null if neither. */
export function effectiveCapacity(registration = {}, venueCapacity = null) {
  const limits = [positiveInteger(registration.capacity), positiveInteger(venueCapacity)].filter((value) => value !== null)
  return limits.length > 0 ? Math.min(...limits) : null
}

export function isActiveRegistration(record) {
  return ACTIVE_REGISTRATION_STATUSES.includes(record?.status)
}

/** SPM-59: an invitation whose deadline has not passed. It holds its place (X3). */
export function isOpenInvitation(record, now = new Date()) {
  const expires = time(record?.invitationExpiresAt)
  return record?.status === INVITED && expires !== null && expires > now.getTime()
}

/** SPM-59: places taken — registrations plus open invitations. Use it as `registeredCount` for availability. */
export function placesHeld(entries, now = new Date()) {
  return entries.filter((entry) => isActiveRegistration(entry) || isOpenInvitation(entry, now)).length
}

// --- Availability ---------------------------------------------------------------------------------

/**
 * Whether registration is open on `event` for anyone, ignoring who is asking: { open, reason, capacity,
 * placesLeft }. `registeredCount` counts active registrations. Reasons are checked in order, so the first
 * thing an Attendee would have to wait for is the one reported.
 */
export function registrationAvailability(event, { venueCapacity = null, registeredCount = 0, now = new Date() } = {}) {
  const registration = event.registration ?? {}
  const capacity = effectiveCapacity(registration, venueCapacity)
  const placesLeft = capacity === null ? null : Math.max(capacity - registeredCount, 0)
  const result = (reason) => ({ open: reason === null, reason, capacity, placesLeft })

  if (registration.enabled !== true) return result(NOT_ENABLED)
  if (!registrationEligibleStatus(event.status)) return result(WRONG_STATUS)
  const opensAt = time(registration.opensAt)
  const closesAt = time(registration.closesAt)
  if (opensAt === null || closesAt === null || positiveInteger(registration.capacity) === null) return result(NOT_CONFIGURED)
  if (now.getTime() < opensAt) return result(NOT_OPEN_YET)
  if (now.getTime() >= closesAt) return result(CLOSED)
  if (placesLeft === 0) return result(FULL)
  return result(null)
}

/**
 * May `user` register for `event` now? { allowed, reason } plus the availability fields. `existing` is the
 * user's registration for this event, or null.
 */
export function canRegister(user, event, { existing = null, ...options } = {}) {
  const availability = registrationAvailability(event, options)
  const refuse = (reason) => ({ ...availability, allowed: false, reason })
  if (!rolesOf(user).includes(ATTENDEE)) return refuse(NOT_ATTENDEE)
  if (isActiveRegistration(existing)) return refuse(ALREADY_REGISTERED)
  // SPM-59: an invited Attendee accepts the place held for them instead.
  if (isOpenInvitation(existing, options.now)) return refuse(INVITATION_OPEN)
  if (!availability.open) return refuse(availability.reason)
  return { ...availability, allowed: true, reason: null }
}

// --- Waiting list (SPM-39) -------------------------------------------------------------------------

/**
 * May `user` join the waiting list for `event` now? { allowed, reason } plus the availability fields. Only when the
 * event is full and registration is otherwise open (AC1); not when registration is closed, not yet open, disabled,
 * unset or the event is not Confirmed/Preparation (AC2); not while a place is free (W4: register instead); once per
 * Attendee, and not while registered.
 */
export function canJoinWaitingList(user, event, { existing = null, ...options } = {}) {
  const availability = registrationAvailability(event, options)
  const refuse = (reason) => ({ ...availability, allowed: false, reason })
  if (!rolesOf(user).includes(ATTENDEE)) return refuse(NOT_ATTENDEE)
  if (isActiveRegistration(existing)) return refuse(ALREADY_REGISTERED)
  if (isOpenInvitation(existing, options.now)) return refuse(INVITATION_OPEN)
  if (existing?.status === WAITLISTED) return refuse(ALREADY_WAITLISTED)
  if (availability.open) return refuse(NOT_FULL)
  if (availability.reason !== FULL) return refuse(availability.reason)
  return { ...availability, allowed: true, reason: null }
}

/**
 * AC3, first come, first served: `uid`'s place in the event's waiting list (1 is next), or null when they are not
 * on it. `entries` are the event's registration records. Order is `waitlistSequence`, the counter taken under the
 * registration lock when they joined (W3), never the Attendee id or a clock.
 */
export function waitingListPosition(entries, uid) {
  const queue = entries
    .filter((entry) => entry.status === WAITLISTED)
    .sort((a, b) => (a.waitlistSequence ?? 0) - (b.waitlistSequence ?? 0))
  const index = queue.findIndex((entry) => entry.attendeeUid === uid)
  return index === -1 ? null : index + 1
}

/** How many Attendees are on the event's waiting list. */
export function waitingListCount(entries) {
  return entries.filter((entry) => entry.status === WAITLISTED).length
}

// --- Withdrawal and invitations (SPM-59) -----------------------------------------------------------

const FINISHED = Object.freeze([COMPLETED, CANCELLED, REJECTED])

/**
 * May `user` withdraw their registration for `event` now? AC1 and X1 (team decision of 31 Oct 2026): only a
 * registered Attendee, only when the Organiser has ticked "Withdrawal allowed", before the Organiser's cut-off if
 * one is set, and before the event starts. Not from a finished event.
 */
export function canWithdraw(user, event, { existing = null, now = new Date() } = {}) {
  const refuse = (reason) => ({ allowed: false, reason })
  if (!rolesOf(user).includes(ATTENDEE)) return refuse(NOT_ATTENDEE)
  if (!isActiveRegistration(existing)) return refuse(NOT_REGISTERED)
  if (FINISHED.includes(event.status)) return refuse(EVENT_CLOSED)
  if (event.registration?.withdrawalAllowed !== true) return refuse(WITHDRAWAL_NOT_ALLOWED)
  const startsAt = time(event.core?.preferredDateTime)
  if (startsAt !== null && now.getTime() >= startsAt) return refuse(EVENT_STARTED)
  const cutOff = time(event.registration?.withdrawalClosesAt)
  if (cutOff !== null && now.getTime() >= cutOff) return refuse(WITHDRAWAL_CLOSED)
  return { allowed: true, reason: null }
}

/** X7: a waitlisted Attendee may leave the waiting list at any time. */
export function canLeaveWaitingList(user, existing) {
  if (!rolesOf(user).includes(ATTENDEE)) return { allowed: false, reason: NOT_ATTENDEE }
  if (existing?.status !== WAITLISTED) return { allowed: false, reason: NOT_WAITLISTED }
  return { allowed: true, reason: null }
}

/** X4: an invited Attendee may accept or decline only while the invitation is open. */
export function canRespondToInvitation(user, existing, now = new Date()) {
  if (!rolesOf(user).includes(ATTENDEE)) return { allowed: false, reason: NOT_ATTENDEE }
  if (existing?.status === INVITATION_EXPIRED) return { allowed: false, reason: INVITATION_EXPIRED }
  if (existing?.status !== INVITED) return { allowed: false, reason: NO_INVITATION }
  if (!isOpenInvitation(existing, now)) return { allowed: false, reason: INVITATION_EXPIRED }
  return { allowed: true, reason: null }
}

/**
 * X2: an invitation issued at `now` lasts INVITATION_HOURS, but ends when registration closes or the event starts,
 * whichever comes first.
 */
export function invitationExpiresAt(event, now = new Date()) {
  const limits = [now.getTime() + INVITATION_HOURS * 60 * 60 * 1000, time(event.registration?.closesAt), time(event.core?.preferredDateTime)]
  return new Date(Math.min(...limits.filter((value) => value !== null))).toISOString()
}

/**
 * AC3, AC5 and X3–X6: bring the event's registration records up to date at `now`. First every invitation whose
 * deadline has passed lapses (X4, X5: checked whenever registrations are read or changed, with no background job).
 * Then, while registration is open and places are free — after a withdrawal, a declined or lapsed invitation, or a
 * capacity rise (X6) — the next people on the waiting list, first come, first served, are invited, never registered.
 * With no one waiting, a free place simply stays open. Returns the changes to write and who was invited or lapsed.
 */
export function settleWaitingList(event, entries, { venueCapacity = null, now = new Date() } = {}) {
  const at = now.toISOString()
  const updates = []
  const expired = []
  const current = entries.map((entry) => {
    if (entry.status !== INVITED || isOpenInvitation(entry, now)) return entry
    const changes = { status: INVITATION_EXPIRED, updatedAt: at }
    updates.push({ attendeeUid: entry.attendeeUid, changes })
    expired.push(entry)
    return { ...entry, ...changes }
  })

  const availability = registrationAvailability(event, { venueCapacity, registeredCount: placesHeld(current, now), now })
  const invited = []
  if (availability.open) {
    const queue = current
      .filter((entry) => entry.status === WAITLISTED)
      .sort((a, b) => (a.waitlistSequence ?? 0) - (b.waitlistSequence ?? 0))
      .slice(0, availability.placesLeft ?? 0)
    const expiresAt = invitationExpiresAt(event, now)
    for (const entry of queue) {
      const changes = { status: INVITED, invitedAt: at, invitationExpiresAt: expiresAt, updatedAt: at }
      updates.push({ attendeeUid: entry.attendeeUid, changes })
      invited.push({ ...entry, ...changes })
    }
  }
  return { updates, invited, expired }
}

// --- Who sees what --------------------------------------------------------------------------------

/** D3: the owning Organiser and the assigned Coordinator may see an event's registrations. */
export function canViewRegistrations(user, event) {
  const owner = inScopeAs(ORGANISER, user, event) && event.ownerUid === user?.uid
  const coordinator = rolesOf(user).includes(COORDINATOR) && isAssignedCoordinator(user, event)
  return owner || coordinator
}

/**
 * What the event page tells an Attendee about registering (`attendeeRegistration` in the response), or null for
 * a user without the Attendee role in scope. Never the `registration` section itself: its notes are the Organiser's.
 */
export function attendeeRegistrationSummary(user, event, { existing = null, venueNames = [], waitingListPosition: position = null, ...options } = {}) {
  if (!inScopeAs(ATTENDEE, user, event)) return null
  const decision = canRegister(user, event, { existing, ...options })
  // SPM-59: the Attendee's record is shown whatever its status (AC4: Withdrawn), so they always see where they stand.
  const own = Boolean(existing?.status)
  return {
    canRegister: decision.allowed,
    reason: decision.reason,
    // SPM-39: offered instead of Register when the event is full and registration is open.
    canJoinWaitingList: canJoinWaitingList(user, event, { existing, ...options }).allowed,
    // SPM-59: Withdraw where the Organiser allows it; Accept/Decline while an invitation is open.
    canWithdraw: canWithdraw(user, event, { existing, now: options.now }).allowed,
    canRespondToInvitation: canRespondToInvitation(user, existing, options.now).allowed,
    withdrawalClosesAt: event.registration?.withdrawalClosesAt ?? null,
    waitingListPosition: existing?.status === WAITLISTED ? position : null,
    opensAt: event.registration?.opensAt ?? null,
    closesAt: event.registration?.closesAt ?? null,
    placesLeft: decision.placesLeft,
    venueNames,
    myRegistration: own ? presentOwnRegistration(existing, null, { waitingListPosition: position }) : null,
  }
}

/** The event-page summary for users who may see the registered list (`registrations` in the response), or null. */
export function staffRegistrationSummary(user, event, { registeredCount = 0, venueCapacity = null } = {}) {
  if (!canViewRegistrations(user, event)) return null
  return { registeredCount, capacity: effectiveCapacity(event.registration ?? {}, venueCapacity) }
}

// --- Records --------------------------------------------------------------------------------------

/**
 * The registration document for `user` on `event`. The event's title, start, duration and venue names are kept
 * on it, so "My registrations" still shows them if the event later leaves the Attendee's view (D5).
 */
export function buildRegistration(event, user, { venueNames = [], at }) {
  return {
    eventRequestId: event.id,
    attendeeUid: user.uid,
    attendeeName: user.name ?? null,
    attendeeEmail: user.email ?? null,
    status: REGISTERED,
    eventTitle: event.core?.title ?? null,
    eventStartsAt: event.core?.preferredDateTime ?? null,
    eventDurationHours: event.core?.durationHours ?? null,
    venueNames,
    registeredAt: at,
    updatedAt: at,
  }
}

/**
 * SPM-39 — the waiting-list entry for `user` on `event`: the same record as a registration (W1), holding no place.
 * `waitlistSequence` is its place in the queue, taken from the registration lock in the joining transaction.
 */
export function buildWaitlistEntry(event, user, { venueNames = [], waitlistSequence, at }) {
  return {
    eventRequestId: event.id,
    attendeeUid: user.uid,
    attendeeName: user.name ?? null,
    attendeeEmail: user.email ?? null,
    status: WAITLISTED,
    waitlistSequence,
    waitlistedAt: at,
    registeredAt: null,
    eventTitle: event.core?.title ?? null,
    eventStartsAt: event.core?.preferredDateTime ?? null,
    eventDurationHours: event.core?.durationHours ?? null,
    venueNames,
    updatedAt: at,
  }
}

/**
 * One of the Attendee's own registrations, as "My registrations" and the event page show it. SPM-41 (E3, team
 * decision of 29 Oct 2026): when the event is given, its current title, start, duration and status are shown, so a
 * rescheduled or cancelled event never reads as it was at registration. The copy kept on the registration is the
 * fallback for an event that no longer exists. The venue stays as registered: SPM-90 keeps registration venue
 * snapshots, and a venue change is SPM-74's to announce. Only these fields of the event are sent.
 */
export function presentOwnRegistration(record, event = null, { waitingListPosition: position = null } = {}) {
  return {
    eventRequestId: record.eventRequestId,
    status: record.status,
    // SPM-39: the Attendee's place in the queue while waitlisted (1 is next), otherwise null.
    waitingListPosition: record.status === WAITLISTED ? position : null,
    // SPM-59: when an invitation runs out, and when the Attendee withdrew.
    invitationExpiresAt: record.status === INVITED ? record.invitationExpiresAt ?? null : null,
    withdrawnAt: record.withdrawnAt ?? null,
    eventStatus: event?.status ?? null,
    eventTitle: event?.core?.title ?? record.eventTitle,
    eventStartsAt: event?.core?.preferredDateTime ?? record.eventStartsAt,
    eventDurationHours: event?.core?.durationHours ?? record.eventDurationHours,
    venueNames: record.venueNames ?? [],
    registeredAt: record.registeredAt,
  }
}

/** One row of the registered list for the owning Organiser or assigned Coordinator (D3). No uid is sent. */
export function presentRegistrant(record) {
  return { name: record.attendeeName, email: record.attendeeEmail, status: record.status, registeredAt: record.registeredAt }
}

// --- Changes to the event (SPM-41) ------------------------------------------------------------------

/** When the event ends: its start plus its duration, as an ISO string; null when either is unknown. */
export function eventEndsAt(core = {}) {
  const start = time(core.preferredDateTime)
  const hours = Number(core.durationHours)
  return start !== null && Number.isFinite(hours) && hours > 0 ? new Date(start + hours * 60 * 60 * 1000).toISOString() : null
}

/**
 * SPM-41: has the event been rescheduled between `before` and `after`? A new start date/time, or (E1, team
 * decision of 29 Oct 2026) a new duration, because the end time moves. The same instant written differently is
 * not a change.
 */
export function eventRescheduled(before, after) {
  return time(before?.core?.preferredDateTime) !== time(after?.core?.preferredDateTime) ||
    Number(before?.core?.durationHours) !== Number(after?.core?.durationHours)
}
