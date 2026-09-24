// Browser replacement for `firebase/app` in the E2E build (aliased by vite.e2e.config.js).

const apps = []

export function initializeApp(options = {}, name = '[E2E-DOUBLE]') {
  const app = { name, options }
  apps.push(app)
  return app
}

export function getApps() {
  return [...apps]
}

export function getApp() {
  return apps[0]
}
