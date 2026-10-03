// SPM-46 unit suite — who sees the assigned Coordinator (shared/assignedCoordinator.js), the per-role scope
// check it relies on (inScopeAs in shared/permissions.js), and the users/{uid} name lookup
// (backend/src/services/assignedCoordinatorService.js) against an in-memory Firestore fake.

import { describe, expect, it, vi } from 'vitest'

import {
  assignedCoordinatorSummary,
  coordinatorUidToLookUp,
  mayViewAssignedCoordinator,
} from '../../../shared/assignedCoordinator.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF, inScopeAs } from '../../../shared/permissions.js'
import { CONFIRMED, DRAFT, PLANNING, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { createCoordinatorNameLoader } from '../../../backend/src/services/assignedCoordinatorService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

const owner = { uid: 'org-owner', roles: [ORGANISER], organisationId: 'ORG-A' }
const colleague = { uid: 'org-colleague', roles: [ORGANISER], organisationId: 'ORG-A' }
const otherOrganisation = { uid: 'org-other', roles: [ORGANISER], organisationId: 'ORG-B' }
const assignedCoordinator = { uid: 'coord-1', roles: [COORDINATOR] }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: SUBMITTED,
    ownerUid: owner.uid,
    organisationId: 'ORG-A',
    assignedStaffUids: ['venue-1', 'tech-1'],
    assignedCoordinatorUid: assignedCoordinator.uid,
    core: { title: 'Launch' },
    registration: { enabled: true },
    ...overrides,
  }
}

describe('SPM-46 — inScopeAs evaluates one role only', () => {
  it('is false for a role the user does not hold, even when another role has the record in scope', () => {
    expect(inScopeAs(ORGANISER, assignedCoordinator, request())).toBe(false)
    expect(inScopeAs(COORDINATOR, assignedCoordinator, request())).toBe(true)
  })

  it('applies the SPM-42 Organiser scope: owner and same-organisation colleague, not another organisation', () => {
    expect(inScopeAs(ORGANISER, owner, request())).toBe(true)
    expect(inScopeAs(ORGANISER, colleague, request())).toBe(true)
    expect(inScopeAs(ORGANISER, otherOrganisation, request())).toBe(false)
  })
})

describe('SPM-46 — who sees the assigned Coordinator', () => {
  it.each([SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED])('the owning Organiser sees it at %s', (status) => {
    expect(mayViewAssignedCoordinator(owner, request({ status }))).toBe(true)
  })

  it('a same-organisation colleague who may view the event sees it too [team decision, 3 Oct 2026]', () => {
    expect(mayViewAssignedCoordinator(colleague, request())).toBe(true)
  })

  it('an Organiser outside the event scope does not', () => {
    expect(mayViewAssignedCoordinator(otherOrganisation, request())).toBe(false)
    expect(assignedCoordinatorSummary(otherOrganisation, request(), 'Ada')).toBeNull()
  })

  it('nobody sees it on a draft, the owner included', () => {
    const draft = request({ status: DRAFT, assignedCoordinatorUid: undefined })
    expect(mayViewAssignedCoordinator(owner, draft)).toBe(false)
    expect(assignedCoordinatorSummary(owner, draft, null)).toBeNull()
  })

  it.each([
    ['the assigned Coordinator', assignedCoordinator],
    ['Venue Staff', { uid: 'venue-1', roles: [VENUE_STAFF] }],
    ['Technical Support Staff', { uid: 'tech-1', roles: [TECHNICAL_STAFF] }],
    ['an Attendee', { uid: 'att-1', roles: [ATTENDEE] }],
  ])('%s receives nothing new', (_label, user) => {
    const confirmed = request({ status: CONFIRMED })
    expect(mayViewAssignedCoordinator(user, confirmed)).toBe(false)
    expect(assignedCoordinatorSummary(user, confirmed, 'Ada')).toBeNull()
  })

  it('a Coordinator who is also an Organiser sees it only where the Organiser role has the event in scope', () => {
    const dual = { uid: 'coord-1', roles: [COORDINATOR, ORGANISER], organisationId: 'ORG-B' }
    // In scope as the assigned Coordinator, but not as an Organiser of ORG-A.
    expect(mayViewAssignedCoordinator(dual, request())).toBe(false)
    expect(mayViewAssignedCoordinator({ ...dual, organisationId: 'ORG-A' }, request())).toBe(true)
  })
})

describe('SPM-46 — the summary', () => {
  it('AC2: an assigned Coordinator is one object carrying the display name only', () => {
    const summary = assignedCoordinatorSummary(owner, request(), 'Ada Lovelace')
    expect(summary).toEqual({ assigned: true, name: 'Ada Lovelace' })
    expect(Object.keys(summary).sort()).toEqual(['assigned', 'name'])
    expect(JSON.stringify(summary)).not.toContain(assignedCoordinator.uid)
  })

  it('AC3: the name follows assignedCoordinatorUid', () => {
    const reassigned = request({ assignedCoordinatorUid: 'coord-2' })
    expect(coordinatorUidToLookUp(owner, request())).toBe('coord-1')
    expect(coordinatorUidToLookUp(owner, reassigned)).toBe('coord-2')
  })

  it.each([undefined, null, ''])('a submitted event with no Coordinator (%s) is not yet assigned, with no lookup', (uid) => {
    const unassigned = request({ assignedCoordinatorUid: uid })
    expect(assignedCoordinatorSummary(owner, unassigned, null)).toEqual({ assigned: false, name: null })
    // A stray name cannot turn an unassigned event into an assigned one.
    expect(assignedCoordinatorSummary(owner, unassigned, 'Ada')).toEqual({ assigned: false, name: null })
    expect(coordinatorUidToLookUp(owner, unassigned)).toBeNull()
  })

  it.each([null, undefined, '', '   ', 42])('an assigned Coordinator with no usable name (%s) is assigned, name unavailable', (name) => {
    expect(assignedCoordinatorSummary(owner, request(), name)).toEqual({ assigned: true, name: null })
  })

  it('trims the display name', () => {
    expect(assignedCoordinatorSummary(owner, request(), '  Ada  ')).toEqual({ assigned: true, name: 'Ada' })
  })

  it('no lookup is requested for anyone who may not see it', () => {
    expect(coordinatorUidToLookUp(assignedCoordinator, request())).toBeNull()
    expect(coordinatorUidToLookUp(otherOrganisation, request())).toBeNull()
  })
})

describe('SPM-46 — loading the name from users/{uid}', () => {
  const users = {
    'coord-1': { name: 'Ada Lovelace', email: 'ada@example.test', roles: [COORDINATOR] },
    'coord-nameless': { email: 'nameless@example.test', roles: [COORDINATOR] },
  }

  function loader(db = createFakeFirestore({ users })) {
    return createCoordinatorNameLoader(() => db)
  }

  it('returns the name and nothing else from the profile', async () => {
    await expect(loader()(owner, request())).resolves.toBe('Ada Lovelace')
  })

  it('returns null for a missing profile or a profile without a name', async () => {
    await expect(loader()(owner, request({ assignedCoordinatorUid: 'coord-missing' }))).resolves.toBeNull()
    await expect(loader()(owner, request({ assignedCoordinatorUid: 'coord-nameless' }))).resolves.toBeNull()
  })

  it('reads nothing for a viewer who may not see it, a draft, or an unassigned event', async () => {
    const getUserDb = vi.fn()
    const load = createCoordinatorNameLoader(getUserDb)
    await load(assignedCoordinator, request())
    await load(otherOrganisation, request())
    await load(owner, request({ status: DRAFT }))
    await load(owner, request({ assignedCoordinatorUid: undefined }))
    expect(getUserDb).not.toHaveBeenCalled()
  })

  it('a failed read yields null rather than failing the page', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = createCoordinatorNameLoader(() => {
      throw new Error('Firestore unavailable')
    })
    await expect(load(owner, request())).resolves.toBeNull()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
