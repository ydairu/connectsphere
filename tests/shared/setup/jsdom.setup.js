// Setup for every jsdom test under tests/: the Firebase client SDK and the app's firebase service
// module are replaced by the in-memory fake, so the real AuthProvider, pages and router run without
// any Firebase project. Each test starts from an empty fake and a clean DOM.

import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// findBy*/waitFor give up after 1000 ms by default. The mocked API answers at once, but role queries
// over a whole page under `--coverage` on a loaded machine (or CI runner) can take longer, so pages
// that load in several steps failed intermittently. This only lengthens the wait, not what is asserted.
configure({ asyncUtilTimeout: 5000 })

vi.mock('firebase/auth', async () => (await import('../mocks/firebaseClientMock.js')).authModule)
vi.mock('firebase/firestore', async () => (await import('../mocks/firebaseClientMock.js')).firestoreModule)
vi.mock('../../../frontend/src/services/firebase.js', async () => (await import('../mocks/firebaseClientMock.js')).servicesModule)

beforeEach(async () => {
  const { fake } = await import('../mocks/firebaseClientMock.js')
  fake.reset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
