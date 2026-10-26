// SPM-42 API suite — in-memory harness. Real HTTP against the real Express app, authenticate and
// authorise middleware and shared/permissions.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence. This is not database verification; requestApi.live.test.js runs the
// same cases against the real project.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { PLANNING, PREPARATION, SUBMITTED } from '../../../shared/status.js'
import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { startInMemoryApi } from '../../shared/helpers/requestApiServer.js'
import { registerSpm42ApiCases } from './requestApi.cases.js'

// Not a seeded account: an Organiser who is also Venue Staff, assigned to their own request at
// planning. The realistic multi-role pairs are staff pairs, but this is the combination that exposes
// the leak a naive implementation has.
const ORGANISER_VENUE = {
  uid: 'test-organiser-venue',
  email: 'organiser-venue@test.invalid',
  name: 'Organiser + Venue',
  roles: [ORGANISER, VENUE_STAFF],
  organisationId: 'TEST-ORG',
  organisationName: 'Test Organisation',
}

const OWN_PLANNING_REQUEST = {
  id: 'test-req-own-planning',
  status: PLANNING,
  ownerUid: ORGANISER_VENUE.uid,
  organisationId: 'TEST-ORG',
  organisationName: 'Test Organisation',
  assignedStaffUids: [ORGANISER_VENUE.uid],
  core: { title: 'Own request at planning' },
  venue: { layoutPreference: 'theatre' },
  equipment: { requirements: [] },
  registration: { enabled: false },
  internal: { planningNotes: '' },
  createdAt: '2026-09-12T10:00:00+08:00',
}

const OWN_PREPARATION_REQUEST = { ...OWN_PLANNING_REQUEST, id: 'test-req-own-preparation', status: PREPARATION }

// Not a seeded account: a self-registered Organiser who has no organisationId yet.
const SELF_REGISTERED_ORGANISER = {
  uid: 'test-self-registered-organiser',
  email: 'self-registered-organiser@test.invalid',
  name: 'Self Registered Organiser',
  roles: [ORGANISER],
  organisationName: 'Named Only Organisation',
}

const OWN_SUBMITTED_WITHOUT_ORGANISATION_ID = {
  id: 'test-req-own-submitted-no-org-id',
  status: SUBMITTED,
  ownerUid: SELF_REGISTERED_ORGANISER.uid,
  organisationId: null,
  organisationName: SELF_REGISTERED_ORGANISER.organisationName,
  assignedStaffUids: [],
  core: { title: 'Submitted request without organisation ID' },
  venue: { layoutPreference: 'classroom' },
  equipment: { requirements: [] },
  registration: { enabled: false },
  internal: { planningNotes: '' },
  createdAt: '2026-09-12T11:00:00+08:00',
}

let api

beforeAll(async () => {
  api = await startInMemoryApi({
    extraAccounts: [ORGANISER_VENUE, SELF_REGISTERED_ORGANISER],
    extraRequests: [OWN_PLANNING_REQUEST, OWN_PREPARATION_REQUEST, OWN_SUBMITTED_WITHOUT_ORGANISATION_ID],
  })
})

afterAll(() => api.close())

registerSpm42ApiCases({ baseUrl: () => api.baseUrl(), tokenFor: (accountKey) => api.tokenFor(accountKey) })

describe("SPM-42 — View and Edit Information According to My Role's Permissions (API, in-memory only)", () => {
  async function getAs(uid, path) {
    const response = await fetch(`${api.baseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${api.tokenForUid(uid)}` },
    })
    return { status: response.status, json: await response.json() }
  }

  async function patchAs(uid, id, body, { rawBody } = {}) {
    const response = await fetch(`${api.baseUrl()}/api/requests/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${api.tokenForUid(uid)}`, 'Content-Type': 'application/json' },
      body: rawBody ?? JSON.stringify(body),
    })
    return { status: response.status, json: await response.json() }
  }

  // Regression for the multi-role leak: under inScope(user) && stateGateOpen(user) && section ∈
  // editableSections(user.roles), the venue role's open gate at planning unlocks the organiser's core.
  it('Organiser who is also venue staff PATCHes the core section of their own request at planning', async () => {
    const response = await patchAs(ORGANISER_VENUE.uid, OWN_PLANNING_REQUEST.id, { core: { title: 'Leaked edit' } })
    expect(response.status).toBe(403)
    expect(response.json.forbiddenFields).toEqual(['core.title'])
  })

  it('Organiser who is also venue staff PATCHes their preparation section at Preparation', async () => {
    // SPM-48: the venue role's section is venue preparation; the requested venue is read-only.
    const response = await patchAs(ORGANISER_VENUE.uid, OWN_PREPARATION_REQUEST.id, { venuePreparation: { status: 'in_progress' } })
    expect(response.status).toBe(200)
    expect(response.json.editableSections).toEqual(['venuePreparation'])
  })

  it('Self-registered organiser lists and opens their own submitted request without organisation ID', async () => {
    const listed = await getAs(SELF_REGISTERED_ORGANISER.uid, '/api/requests')
    expect(listed.status).toBe(200)
    expect(
      listed.json.requests.some((request) => request.id === OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id),
      'own submitted request is listed even before organisationId assignment',
    ).toBe(true)

    const opened = await getAs(SELF_REGISTERED_ORGANISER.uid, `/api/requests/${OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id}`)
    expect(opened.status).toBe(200)
    expect(opened.json.request.id).toBe(OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id)
    expect(opened.json.editableSections, 'submitted organiser request stays read-only').toEqual([])
  })

  it('PATCH with a body that is not valid JSON', async () => {
    const response = await patchAs(SEED_ACCOUNTS.coordinator.uid, 'seed-req-a1-submitted', undefined, { rawBody: '{not json' })
    expect(response.status).toBe(400)
  })

  it('PATCH with an empty object', async () => {
    const response = await patchAs(SEED_ACCOUNTS.coordinator.uid, 'seed-req-a1-submitted', {})
    expect(response.status).toBe(400)
  })
})
