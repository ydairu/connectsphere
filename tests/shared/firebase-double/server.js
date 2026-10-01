// Entry point for the E2E Firebase double + real API server (see doubleServer.js).
// The backend reads CLIENT_ORIGIN when its env module is first imported, so it is set before the
// dynamic import below. Playwright starts this through playwright.config.js.

process.env.CLIENT_ORIGIN ??= 'http://127.0.0.1:5174'

const { startDoubleServer } = await import('./doubleServer.js')

startDoubleServer({
  port: Number(process.env.PORT) || 5001,
  clientOrigin: process.env.CLIENT_ORIGIN,
})
