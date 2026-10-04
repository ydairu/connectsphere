// SPM-64 follow-up (AC4/AC6) — ownerName and isOwnRequest in the API, for Organisers only, never with a uid.
// In-memory harness (tests/shared/helpers/requestApiServer.js): real HTTP against the real Express app and
// middleware; Firebase token verification, persistence and users/{uid} are in memory. Not database
// verification. Also unit cases for shared/requestOwner.js.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { mayViewRequestOwner, ownerUidsToLookUp, requestOwnerFields } from '../../../shared/requestOwner.js'
import { apiClient, startInMemoryApi } from '../../shared/helpers/requestApiServer.js'

const { organiserA1, organiserA2 } = SEED_ACCOUNTS
const OWN_SUBMITTED = 'seed-req-a1-submitted'
const OWN_RETURNED = 'seed-req-a1-returned'
const COLLEAGUES = 'seed-req-a2-submitted'
const ALL_UIDS = Object.values(SEED_ACCOUNTS).map((account) => account.uid)

let harness
let api

beforeAll(async () => {
  harness = await startInMemoryApi()
  api = apiClient(harness)
})

afterAll(() => harness.close())

/** No seeded uid appears anywhere in the raw body, as a value or inside the owner's name. */
function expectNoUid(response) {
  for (const uid of ALL_UIDS) expect(response.text, uid).not.toContain(`"${uid}"`)
}

describe('SPM-64 follow-up — the Organiser\'s list says who submitted each request', () => {
  it('own requests are marked as theirs, colleagues\' requests carry the colleague\'s name', async () => {
    const response = await api.list('organiserA1')
    expect(response.status).toBe(200)
    const byId = Object.fromEntries(response.json.requests.map((request) => [request.id, request]))

    expect(byId[OWN_SUBMITTED]).toMatchObject({ ownerName: organiserA1.name, isOwnRequest: true })
    expect(byId[COLLEAGUES]).toMatchObject({ ownerName: organiserA2.name, isOwnRequest: false })
    for (const request of response.json.requests) {
      expect(typeof request.isOwnRequest).toBe('boolean')
      expect(request).not.toHaveProperty('ownerUid')
    }
    expectNoUid(response)
  })

  it('the colleague sees the same requests the other way round', async () => {
    const byId = Object.fromEntries((await api.list('organiserA2')).json.requests.map((request) => [request.id, request]))
    expect(byId[COLLEAGUES]).toMatchObject({ ownerName: organiserA2.name, isOwnRequest: true })
    expect(byId[OWN_SUBMITTED]).toMatchObject({ ownerName: organiserA1.name, isOwnRequest: false })
  })

  it('scoping is unchanged: another organisation\'s Organiser lists none of organisation A\'s requests or names', async () => {
    const response = await api.list('organiserB1')
    expect(response.json.requests.map((request) => request.id)).not.toContain(OWN_SUBMITTED)
    expect(response.json.requests.map((request) => request.id)).not.toContain(COLLEAGUES)
    expect(response.text).not.toContain(organiserA1.name)
    expect(response.text).not.toContain(organiserA2.name)
    for (const request of response.json.requests) expect(request.isOwnRequest).toBe(true)
  })
})

describe('SPM-64 follow-up — the request page response', () => {
  it('a colleague\'s request names its owner and is marked as not theirs', async () => {
    const response = await api.get('organiserA1', COLLEAGUES)
    expect(response.json).toMatchObject({ ownerName: organiserA2.name, isOwnRequest: false, editableSections: [] })
    expectNoUid(response)
  })

  it('an own request is marked as theirs', async () => {
    expect((await api.get('organiserA1', OWN_SUBMITTED)).json).toMatchObject({ ownerName: organiserA1.name, isOwnRequest: true })
  })

  it('a section save keeps the fields in the response', async () => {
    const response = await api.patch('organiserA1', OWN_RETURNED, { core: { purpose: 'Updated' } })
    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({ ownerName: organiserA1.name, isOwnRequest: true })
  })

  it('an out-of-scope Organiser is still refused, with no name', async () => {
    const response = await api.get('organiserB1', OWN_SUBMITTED)
    expect(response.status).toBe(403)
    expect(response.text).not.toContain(organiserA1.name)
  })
})

describe('SPM-64 follow-up — other roles are unchanged', () => {
  it.each([
    ['coordinator', OWN_SUBMITTED],
    ['venueStaff', 'seed-req-a1-planning'],
    ['technicalStaff', 'seed-req-a1-planning'],
    ['venueTechnicalStaff', 'seed-req-a1-planning'],
    ['attendee', 'seed-req-a1-confirmed'],
  ])('%s: no ownerName or isOwnRequest, in the list or on the request', async (account, id) => {
    const single = await api.get(account, id)
    expect(single.status).toBe(200)
    expect(single.json).not.toHaveProperty('ownerName')
    expect(single.json).not.toHaveProperty('isOwnRequest')
    expect(single.text).not.toContain(organiserA1.name)

    const list = await api.list(account)
    for (const request of list.json.requests) {
      expect(request).not.toHaveProperty('ownerName')
      expect(request).not.toHaveProperty('isOwnRequest')
    }
  })
})

describe('SPM-64 follow-up — shared/requestOwner.js', () => {
  const owner = { uid: 'o1', name: 'Owner One', roles: ['organiser'], organisationId: 'ORG' }
  const colleague = { uid: 'o2', name: 'Colleague Two', roles: ['organiser'], organisationId: 'ORG' }
  const own = { id: 'r1', status: 'submitted', ownerUid: 'o1', organisationId: 'ORG' }
  const theirs = { id: 'r2', status: 'submitted', ownerUid: 'o2', organisationId: 'ORG' }

  it('only colleagues\' names are looked up, once each', () => {
    expect(ownerUidsToLookUp(owner, [own, theirs, { ...theirs, id: 'r3' }])).toEqual(['o2'])
    expect(ownerUidsToLookUp({ uid: 'c', roles: ['coordinator'] }, [own, theirs])).toEqual([])
  })

  it('the fields hold a name and a flag, nothing else', () => {
    expect(requestOwnerFields(owner, own)).toEqual({ ownerName: 'Owner One', isOwnRequest: true })
    expect(requestOwnerFields(owner, theirs, new Map([['o2', 'Colleague Two']]))).toEqual({ ownerName: 'Colleague Two', isOwnRequest: false })
    expect(requestOwnerFields(owner, theirs, new Map([['o2', null]]))).toEqual({ ownerName: null, isOwnRequest: false })
  })

  it('a non-Organiser, or an Organiser outside the scope, gets nothing', () => {
    expect(requestOwnerFields({ uid: 'c', roles: ['coordinator'] }, { ...own, assignedCoordinatorUid: 'c' })).toEqual({})
    expect(requestOwnerFields({ uid: 'x', roles: ['organiser'], organisationId: 'OTHER' }, own)).toEqual({})
    expect(mayViewRequestOwner(colleague, { ...own, status: 'draft' })).toBe(false)
  })
})
