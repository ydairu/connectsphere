// SPM-24 API suite — live harness. The same cases as draftListApi.test.js against the real Firebase
// project; read-only, so it changes nothing. Skipped unless opted in:
//   LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live

import { afterAll, beforeAll, describe } from 'vitest'

import { liveSkipReason, startLiveApi } from '../../shared/helpers/requestApiServer.js'
import { registerSpm24ApiCases } from './draftListApi.cases.js'

const skip = liveSkipReason()

describe.skipIf(skip)('SPM-24 API — against the real Firebase project', () => {
  let api

  beforeAll(async () => {
    api = await startLiveApi()
  })

  afterAll(() => api.close())

  registerSpm24ApiCases({ baseUrl: () => api.baseUrl(), tokenFor: (accountKey) => api.tokenFor(accountKey) })
})
