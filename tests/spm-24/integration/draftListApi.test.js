// SPM-24 API suite — in-memory harness. The same cases run against the real project in
// draftListApi.live.test.js.

import { afterAll, beforeAll } from 'vitest'

import { startInMemoryApi } from '../../shared/helpers/requestApiServer.js'
import { registerSpm24ApiCases } from './draftListApi.cases.js'

let api

beforeAll(async () => {
  api = await startInMemoryApi()
})

afterAll(() => api.close())

registerSpm24ApiCases({ baseUrl: () => api.baseUrl(), tokenFor: (accountKey) => api.tokenFor(accountKey) })
