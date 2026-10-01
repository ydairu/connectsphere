// SPM-42 API suite — live harness. The same cases as requestApi.test.js with nothing mocked: each
// seeded account signs in through Firebase Authentication for a real ID token, and the app uses the
// real authenticate middleware and the real Firestore project named in the root .env.
//
// Writes to the REAL project: cases that edit a seeded request restore the seeded value before they
// finish. Only seeded requests are touched. Re-run backend/scripts/seed.js after an interrupted run.
//
// Skipped unless opted in, so CI never reaches a real project:
//   LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live

import { afterAll, beforeAll, describe } from 'vitest'

import { liveSkipReason, startLiveApi } from '../../shared/helpers/requestApiServer.js'
import { registerSpm42ApiCases } from './requestApi.cases.js'

const skip = liveSkipReason()

describe.skipIf(skip)('SPM-42 API — against the real Firebase project', () => {
  let api

  beforeAll(async () => {
    api = await startLiveApi()
  })

  afterAll(() => api.close())

  registerSpm42ApiCases({ baseUrl: () => api.baseUrl(), tokenFor: (accountKey) => api.tokenFor(accountKey) })
})
