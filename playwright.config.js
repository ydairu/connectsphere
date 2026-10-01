import { defineConfig, devices } from '@playwright/test'

// E2E runs the real React app and the real Express API. Firebase is replaced by the in-memory double
// in tests/shared/firebase-double (no Java, no emulator, no network, no production project).
const DOUBLE_PORT = 5001
const WEB_PORT = 5174
const DOUBLE_ORIGIN = `http://127.0.0.1:${DOUBLE_PORT}`
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/e2e/**/*.spec.js',
  outputDir: 'test-results',
  // The double holds shared state that is reset before every test, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/shared/firebase-double/server.js',
      url: `${DOUBLE_ORIGIN}/__double__/health`,
      reuseExistingServer: false,
      env: { PORT: String(DOUBLE_PORT), CLIENT_ORIGIN: WEB_ORIGIN },
    },
    {
      command: 'npx vite --config tests/shared/firebase-double/vite.e2e.config.js',
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      env: { VITE_API_URL: DOUBLE_ORIGIN, E2E_WEB_PORT: String(WEB_PORT) },
    },
  ],
})
