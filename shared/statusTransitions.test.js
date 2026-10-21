// SPM-9 — event lifecycle transitions, at the pure-function level. Recording the change in the activity
// history and the HTTP routes are tested where they are built.
//
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIONS,
  APPROVE,
  APPROVE_CANCELLATION,
  ARRANGEMENTS_NOT_APPROVED,
  CANCEL,
  COMPLETE,
  CONFIRM,
  EVENT_NOT_ENDED,
  NOT_PERMITTED,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  SUBMIT,
  TERMINAL_STATUS,
  TERMINAL_STATUSES,
  UNKNOWN_ACTION,
  WRONG_STATUS,
  arrangementsApproved,
  availableActions,
  canTransition,
  EVENT_STARTED,
  eventHasEnded,
  targetStatus,
} from './statusTransitions.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from './permissions.js'
import { ARRANGEMENT_APPROVED, ARRANGEMENT_REJECTED } from './arrangements.js'
import { CANCELLATION_PENDING, CANCELLATION_REFUSED, CANCELLATION_REQUEST_PENDING, NO_PENDING_CANCELLATION } from './cancellationRequests.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  REJECTED,
  RETURNED,
  STATUSES,
  SUBMITTED,
  UNDER_REVIEW,
} from './status.js'

// --- fixtures -------------------------------------------------------------------------------------

const NOW = new Date('2026-10-01T12:00:00.000Z')

const owner = { uid: 'org-1', roles: [ORGANISER] }
const otherOrganiser = { uid: 'org-2', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }
const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }
const technicalStaff = { uid: 'tech-1', roles: [TECHNICAL_STAFF] }
const attendee = { uid: 'att-1', roles: [ATTENDEE] }

// An event that ended a day before NOW, so the completion guard passes.
function requestAt(status, overrides = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    assignedCoordinatorUid: status === DRAFT ? null : assigned.uid,
    assignedStaffUids: [venueStaff.uid, technicalStaff.uid],
    // Complete enough to approve (SPM-5's sufficient-information guard).
    core: { title: 'Partner Forum', purpose: 'Partner updates', expectedAttendees: 50, preferredDateTime: '2026-09-29T09:00:00.000Z', durationHours: 4 },
    venue: { layoutPreference: 'theatre' },
    ...overrides,
  }
}

const approved = (by) => ({ decision: ARRANGEMENT_APPROVED, byUid: by.uid, at: '2026-09-30T00:00:00.000Z' })
const bothApproved = { venue: approved(venueStaff), technical: approved(technicalStaff) }
const pendingCancellation = { status: CANCELLATION_PENDING, reason: 'Keynote withdrew', requestedByUid: owner.uid }
// SPM-63/SPM-47: cancellation is possible only before the event starts.
const upcoming = { core: { ...requestAt(CONFIRMED).core, preferredDateTime: '2026-12-01T09:00:00.000Z' } }

// What a request needs, beyond its status, for an action's guard to pass.
const GUARD_SETUP = {
  [CONFIRM]: { arrangementApprovals: bothApproved, venueBookingReadiness: { ready: true } },
  [CANCEL]: upcoming,
  [APPROVE_CANCELLATION]: { ...upcoming, cancellationRequest: pendingCancellation },
}

// The SPM-9 lifecycle, as [action, from, to, actor].
const LIFECYCLE = [
  [SUBMIT, DRAFT, SUBMITTED, owner],
  [RESUBMIT, RETURNED, SUBMITTED, owner],
  [START_REVIEW, SUBMITTED, UNDER_REVIEW, assigned],
  [RETURN_FOR_CLARIFICATION, UNDER_REVIEW, RETURNED, assigned],
  [APPROVE, UNDER_REVIEW, PLANNING, assigned],
  [CONFIRM, PLANNING, CONFIRMED, assigned],
  [REJECT, UNDER_REVIEW, REJECTED, assigned],
  [REJECT, PLANNING, REJECTED, assigned],
  [COMPLETE, CONFIRMED, COMPLETED, assigned],
  [CANCEL, CONFIRMED, CANCELLED, assigned],
  [APPROVE_CANCELLATION, CONFIRMED, CANCELLED, assigned],
]

const ALLOWED_FROM = new Map()
for (const [action, from] of LIFECYCLE) ALLOWED_FROM.set(action, [...(ALLOWED_FROM.get(action) ?? []), from])

// --- tests ----------------------------------------------------------------------------------------

describe('SPM-9 — valid statuses', () => {
  test('the nine statuses in the criteria all exist, and only three are terminal', () => {
    assert.deepEqual(
      [...STATUSES].sort(),
      [DRAFT, SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED, COMPLETED, CANCELLED, REJECTED].sort(),
    )
    assert.deepEqual([...TERMINAL_STATUSES].sort(), [CANCELLED, COMPLETED, REJECTED].sort())
  })

  test('every action leads to a known status', () => {
    for (const action of ACTIONS) assert.ok(STATUSES.includes(targetStatus(action)), action)
    assert.equal(targetStatus('approve_and_confirm'), null)
  })
})

describe('SPM-9 — each transition the criteria name', () => {
  for (const [action, from, to, actor] of LIFECYCLE) {
    test(`${action}: ${from} → ${to} by ${actor.uid}`, () => {
      assert.deepEqual(canTransition(actor, requestAt(from, GUARD_SETUP[action]), action, NOW), { allowed: true, from, to })
    })
  }
})

describe('SPM-9 — status changes are consistent with the actions performed', () => {
  test('every action is refused from every status the criteria do not allow it from', () => {
    for (const action of ACTIONS) {
      for (const status of STATUSES) {
        if (ALLOWED_FROM.get(action).includes(status)) continue
        const actor = action === SUBMIT || action === RESUBMIT ? owner : assigned
        const { allowed, reason } = canTransition(actor, requestAt(status), action, NOW)
        assert.equal(allowed, false, `${action} from ${status}`)
        assert.equal(reason, TERMINAL_STATUSES.includes(status) ? TERMINAL_STATUS : WRONG_STATUS, `${action} from ${status}`)
      }
    }
  })

  test('there is no direct path that skips review: Submitted cannot go straight to Planning or Confirmed', () => {
    assert.equal(canTransition(assigned, requestAt(SUBMITTED), APPROVE, NOW).reason, WRONG_STATUS)
    assert.equal(canTransition(assigned, requestAt(SUBMITTED), CONFIRM, NOW).reason, WRONG_STATUS)
  })

  test('an unknown action is refused', () => {
    assert.deepEqual(canTransition(assigned, requestAt(SUBMITTED), 'set_status', NOW), {
      allowed: false,
      reason: UNKNOWN_ACTION,
    })
  })
})

describe('SPM-9 — Completed, Cancelled and Rejected are terminal', () => {
  const everyone = [
    owner,
    otherOrganiser,
    assigned,
    otherCoordinator,
    venueStaff,
    technicalStaff,
    attendee,
    { uid: assigned.uid, roles: [ORGANISER, COORDINATOR, VENUE_STAFF, TECHNICAL_STAFF, ATTENDEE] },
  ]

  for (const status of TERMINAL_STATUSES) {
    test(`no user can perform any action on a ${status} event`, () => {
      for (const user of everyone) {
        for (const action of ACTIONS) {
          assert.deepEqual(canTransition(user, requestAt(status), action, NOW), { allowed: false, reason: TERMINAL_STATUS })
        }
        assert.deepEqual(availableActions(user, requestAt(status), NOW), [])
      }
    })
  }
})

describe('SPM-9 — who may perform each action', () => {
  test('only the owning Organiser submits and resubmits', () => {
    for (const [action, from] of [[SUBMIT, DRAFT], [RESUBMIT, RETURNED]]) {
      for (const user of [otherOrganiser, assigned, otherCoordinator, venueStaff, technicalStaff, attendee]) {
        assert.equal(canTransition(user, requestAt(from), action, NOW).reason, NOT_PERMITTED, `${action} by ${user.uid}`)
      }
    }
  })

  test('the owner uid alone is not enough: the user must also hold the Organiser role', () => {
    const ownerWithoutRole = { uid: owner.uid, roles: [ATTENDEE] }
    assert.equal(canTransition(ownerWithoutRole, requestAt(DRAFT), SUBMIT, NOW).reason, NOT_PERMITTED)
  })

  test('Coordinator actions are refused to the owner, staff, attendees and an unassigned Coordinator', () => {
    for (const [action, from] of LIFECYCLE.filter(([, , , actor]) => actor === assigned).map(([a, f]) => [a, f])) {
      for (const user of [owner, otherCoordinator, venueStaff, technicalStaff, attendee]) {
        assert.equal(canTransition(user, requestAt(from), action, NOW).reason, NOT_PERMITTED, `${action} by ${user.uid}`)
      }
    }
  })

  test('a request with no assigned Coordinator cannot be moved by any Coordinator', () => {
    const unassigned = requestAt(SUBMITTED, { assignedCoordinatorUid: null })
    assert.equal(canTransition(assigned, unassigned, START_REVIEW, NOW).reason, NOT_PERMITTED)
  })

  test('the assigned uid alone is not enough: the user must also hold the Coordinator role', () => {
    const formerCoordinator = { uid: assigned.uid, roles: [VENUE_STAFF] }
    assert.equal(canTransition(formerCoordinator, requestAt(SUBMITTED), START_REVIEW, NOW).reason, NOT_PERMITTED)
  })

  test('a user who is Organiser and Coordinator gets each role\'s actions on the right records only', () => {
    const both = { uid: 'dual-1', roles: [ORGANISER, COORDINATOR] }
    // Their own returned request: may resubmit as owner, but not review it (not its assigned Coordinator).
    const own = requestAt(RETURNED, { ownerUid: both.uid })
    assert.deepEqual(availableActions(both, own, NOW), [RESUBMIT])
    // Someone else's request assigned to them: Coordinator actions, never Organiser ones.
    const assignedToThem = requestAt(UNDER_REVIEW, { assignedCoordinatorUid: both.uid })
    assert.deepEqual(availableActions(both, assignedToThem, NOW), [RETURN_FOR_CLARIFICATION, APPROVE, REJECT])
  })
})

describe('SPM-9 — confirm guard: mandatory venue and technical arrangements', () => {
  test('confirm is refused while no arrangement is approved', () => {
    assert.equal(arrangementsApproved(requestAt(PLANNING)), false)
    assert.deepEqual(canTransition(assigned, requestAt(PLANNING), CONFIRM, NOW), {
      allowed: false,
      reason: ARRANGEMENTS_NOT_APPROVED,
    })
    assert.ok(!availableActions(assigned, requestAt(PLANNING), NOW).includes(CONFIRM))
  })

  test('confirm is refused while either required arrangement is missing or rejected', () => {
    const rejectedVenue = { ...bothApproved, venue: { ...approved(venueStaff), decision: ARRANGEMENT_REJECTED } }
    for (const arrangementApprovals of [{ venue: approved(venueStaff) }, { technical: approved(technicalStaff) }, rejectedVenue]) {
      const request = requestAt(PLANNING, { equipment: { technicalSupportNeeded: true }, arrangementApprovals })
      assert.equal(canTransition(assigned, request, CONFIRM, NOW).reason, ARRANGEMENTS_NOT_APPROVED, JSON.stringify(arrangementApprovals))
    }
  })

  test('confirm is allowed once venue and required technical arrangements are approved', () => {
    const request = requestAt(PLANNING, { equipment: { technicalSupportNeeded: true }, arrangementApprovals: bothApproved, venueBookingReadiness: { ready: true } })
    assert.deepEqual(canTransition(assigned, request, CONFIRM, NOW), { allowed: true, from: PLANNING, to: CONFIRMED })
    assert.deepEqual(availableActions(assigned, request, NOW), [CONFIRM, REJECT])
  })

  test('an event that asks for no equipment or technical support needs only the venue approved', () => {
    const request = requestAt(PLANNING, {
      equipment: { requirements: [], technicalSupportNeeded: false },
      arrangementApprovals: { venue: approved(venueStaff) },
      venueBookingReadiness: { ready: true },
    })
    assert.equal(canTransition(assigned, request, CONFIRM, NOW).allowed, true)
  })

  test('the actor check runs before the guard, so an unassigned user is told "not permitted"', () => {
    assert.equal(canTransition(otherCoordinator, requestAt(PLANNING), CONFIRM, NOW).reason, NOT_PERMITTED)
  })
})

describe('SPM-9 — completion guard: the event has taken place', () => {
  const at = (iso, hours) => requestAt(CONFIRMED, { core: { preferredDateTime: iso, durationHours: hours } })

  test('refused before the event ends, allowed exactly at and after its end', () => {
    // NOW is 12:00. 09:00 + 3.5h ends 12:30 (not yet); 09:00 + 3h ends exactly at NOW; 08:00 + 3h ended at 11:00.
    assert.equal(canTransition(assigned, at('2026-10-01T09:00:00.000Z', 3.5), COMPLETE, NOW).reason, EVENT_NOT_ENDED)
    assert.equal(canTransition(assigned, at('2026-10-01T09:00:00.000Z', 3), COMPLETE, NOW).allowed, true)
    assert.equal(canTransition(assigned, at('2026-10-01T08:00:00.000Z', 3), COMPLETE, NOW).allowed, true)
  })

  test('an event in the future cannot be completed', () => {
    assert.equal(canTransition(assigned, at('2026-12-01T09:00:00.000Z', 2), COMPLETE, NOW).reason, EVENT_NOT_ENDED)
  })

  test('missing or invalid date and duration count as not ended', () => {
    for (const core of [
      {},
      { preferredDateTime: null, durationHours: 2 },
      { preferredDateTime: 'not a date', durationHours: 2 },
      { preferredDateTime: '2026-09-01T09:00:00.000Z' },
      { preferredDateTime: '2026-09-01T09:00:00.000Z', durationHours: 0 },
      { preferredDateTime: '2026-09-01T09:00:00.000Z', durationHours: '2' },
    ]) {
      assert.equal(eventHasEnded({ core }, NOW), false, JSON.stringify(core))
    }
    assert.equal(eventHasEnded({}, NOW), false)
  })

  test("direct cancel is refused while an Organiser's cancellation request is pending", () => {
    const request = requestAt(CONFIRMED, { ...upcoming, cancellationRequest: pendingCancellation })
    assert.equal(canTransition(assigned, request, CANCEL, NOW).reason, CANCELLATION_REQUEST_PENDING)
    assert.deepEqual(availableActions(assigned, request, NOW), [APPROVE_CANCELLATION])
  })

  test('approving cancellation needs a pending request; a refused one does not count', () => {
    assert.equal(canTransition(assigned, requestAt(CONFIRMED), APPROVE_CANCELLATION, NOW).reason, NO_PENDING_CANCELLATION)
    const refused = requestAt(CONFIRMED, { cancellationRequest: { ...pendingCancellation, status: CANCELLATION_REFUSED } })
    assert.equal(canTransition(assigned, refused, APPROVE_CANCELLATION, NOW).reason, NO_PENDING_CANCELLATION)
  })

  // Superseded by SPM-63: "only a Confirmed event, up to its start date/time" (tests/spm-63).
  test('a Confirmed event can be cancelled before it starts, and not after', () => {
    assert.equal(canTransition(assigned, at('2026-12-01T09:00:00.000Z', 2), CANCEL, NOW).allowed, true)
    assert.equal(canTransition(assigned, at('2026-09-29T09:00:00.000Z', 2), CANCEL, NOW).reason, EVENT_STARTED)
  })
})

describe('SPM-9 — availableActions', () => {
  test('lists exactly the actions a user may take at each status', () => {
    assert.deepEqual(availableActions(owner, requestAt(DRAFT), NOW), [SUBMIT])
    assert.deepEqual(availableActions(owner, requestAt(SUBMITTED), NOW), [])
    assert.deepEqual(availableActions(assigned, requestAt(SUBMITTED), NOW), [START_REVIEW])
    assert.deepEqual(availableActions(assigned, requestAt(UNDER_REVIEW), NOW), [RETURN_FOR_CLARIFICATION, APPROVE, REJECT])
    assert.deepEqual(availableActions(assigned, requestAt(PLANNING), NOW), [REJECT])
    // The fixture's event has ended: it can be completed, and (SPM-63) no longer cancelled.
    assert.deepEqual(availableActions(assigned, requestAt(CONFIRMED), NOW), [COMPLETE])
    assert.deepEqual(availableActions(assigned, requestAt(CONFIRMED, upcoming), NOW), [CANCEL])
    assert.deepEqual(availableActions(owner, requestAt(RETURNED), NOW), [RESUBMIT])
  })
})
