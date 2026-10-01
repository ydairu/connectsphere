// SPM-24 API cases: what the drafts page and the requests page receive. Registered by two suites:
//   draftListApi.test.js       in-memory persistence and stubbed token verification (runs in CI)
//   draftListApi.live.test.js  real Firebase Auth tokens and the real Firestore project (opt-in)
//
// That a draft reaches only its owner is SPM-42's scope predicate; these cases prove the data the
// SPM-24 pages are given, so the pages rest on the API rather than on a filter in the browser.

import { describe, expect, it } from 'vitest'

import { SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { DRAFT } from '../../../shared/status.js'
import { apiClient } from '../../shared/helpers/requestApiServer.js'

const A1_DRAFT = 'seed-req-a1-draft'
const A1_SUBMITTED = 'seed-req-a1-submitted'
const A2_DRAFT = 'seed-req-a2-draft'

/** @param {{ baseUrl: () => string, tokenFor: (accountKey: string) => Promise<string> }} harness */
export function registerSpm24ApiCases(harness) {
  const { get, list } = apiClient(harness)

// The drafts page reads GET /api/requests and keeps status === DRAFT. These cases prove the data it
// receives, so the page's behaviour rests on the API rather than on a filter in the browser.
describe('SPM-24 — View My Saved Draft Requests and Distinguish Them from Submitted Requests (API)', () => {
  it('Every draft the Organiser owns is listed, and no draft belonging to another Organiser appears', async () => {
    const response = await list('organiserA1')
    expect(response.status).toBe(200)
    const drafts = response.json.requests.filter((request) => request.status === DRAFT)
    const ownDraftIds = SEED_REQUESTS.filter((request) => request.status === DRAFT && request.ownerUid === 'seed-organiser-a1').map((request) => request.id)
    expect(ownDraftIds.length > 1, 'precondition: the seed holds several drafts for this Organiser').toBeTruthy()
    expect(drafts.map((draft) => draft.id).sort()).toEqual(ownDraftIds.sort())
  })

  it('The drafts list is ordered newest first', async () => {
    const response = await list('organiserA1')
    const drafts = response.json.requests.filter((request) => request.status === DRAFT)
    const expected = SEED_REQUESTS
      .filter((request) => request.status === DRAFT && request.ownerUid === 'seed-organiser-a1')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((request) => request.id)
    expect(drafts.map((draft) => draft.id)).toEqual(expected)
  })

  it('An Organiser in another organisation sees only their own draft', async () => {
    const response = await list('organiserB1')
    expect(response.status).toBe(200)
    const drafts = response.json.requests.filter((request) => request.status === DRAFT)
    expect(drafts.map((draft) => draft.id)).toEqual(['seed-req-b1-draft'])
  })

  it('An Organiser with no saved drafts receives none — the drafts page shows its empty state', async () => {
    const response = await list('organiserA3')
    expect(response.status).toBe(200)
    expect(response.json.requests.filter((request) => request.status === DRAFT)).toEqual([])
  })

  it('A submitted request is listed with its current status, not as a draft', async () => {
    const response = await list('organiserA1')
    const submitted = response.json.requests.find((request) => request.id === A1_SUBMITTED)
    expect(submitted, 'the submitted request is listed').toBeTruthy()
    expect(submitted.status).not.toBe(DRAFT)
  })

  it('A draft that has never been submitted is not visible to an Event Coordinator', async () => {
    const listed = await list('coordinator')
    expect(!listed.json.requests.some((request) => request.id === A1_DRAFT), 'not in the list').toBeTruthy()
    const direct = await get('coordinator', A1_DRAFT)
    expect(direct.status, 'not reachable by direct id either').toBe(403)
  })

  it('A draft that has never been submitted is not visible to another Organiser in the same organisation', async () => {
    const listed = await list('organiserA1')
    expect(!listed.json.requests.some((request) => request.id === A2_DRAFT), 'not in the list').toBeTruthy()
    const direct = await get('organiserA1', A2_DRAFT)
    expect(direct.status, 'not reachable by direct id either').toBe(403)
  })
})
}
