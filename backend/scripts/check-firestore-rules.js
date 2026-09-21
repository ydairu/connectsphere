// Checks the DEPLOYED firestore.rules from the browser's position: real Firebase Auth ID tokens against
// the Firestore REST API, which enforces rules exactly as the web SDK does. The Admin SDK bypasses
// rules, so nothing here may use it except the cleanup at the end.
//
// SPM-42: "direct-link and API attempts to reach unauthorised information are denied; an
// interface-level restriction alone does not satisfy this criterion."
//
// Usage (from the repo root):
//   node backend/scripts/check-firestore-rules.js --project=<projectId>
//
// Needs VITE_FIREBASE_API_KEY and SEED_ACCOUNT_PASSWORD in the root .env, and the seed applied.
// Editing firestore.rules changes nothing until it is deployed:
//   firebase deploy --only firestore:rules --project <projectId>
//
// What it writes: one temporary Auth user and its users/{uid} document, to check the registration path,
// both removed before it exits. It also renames the seeded attendee's profile and restores it.

import { parseArgs } from 'node:util'

import { env } from '../src/config/env.js'
import { getAdminAuth, getAdminDb } from '../src/config/firebaseAdmin.js'
import { SEED_ACCOUNTS } from './seedData.js'
import { banner } from './writeGuard.js'

const PROPAGATION_TIMEOUT_MS = 120_000

const apiKey = process.env.VITE_FIREBASE_API_KEY
const password = process.env.SEED_ACCOUNT_PASSWORD

function documentsUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

async function identityToolkit(method, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${method} failed: ${payload.error?.message}`)
  return payload
}

const string = (value) => ({ stringValue: value })
const list = (...values) => ({ arrayValue: { values: values.map(string) } })

async function main() {
  const { values } = parseArgs({ options: { project: { type: 'string' } }, strict: true })
  const projectId = env.firebaseProjectId

  console.log(banner('check-firestore-rules — deployed rules, as the browser sees them', projectId, { ok: true, write: false }))

  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID is not set in the root .env — refusing to run.')
    process.exitCode = 1
    return
  }
  if (values.project !== projectId) {
    console.error(`This checks the live project. Re-run with --project=${projectId} to confirm.`)
    process.exitCode = 1
    return
  }
  if (!apiKey || !password) {
    console.error('VITE_FIREBASE_API_KEY and SEED_ACCOUNT_PASSWORD must both be set in the root .env.')
    process.exitCode = 1
    return
  }

  const documents = documentsUrl(projectId)
  const results = []

  async function firestore(token, method, path, body) {
    const response = await fetch(`${documents}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return response.status
  }

  function record(name, status, expected) {
    const ok = status === expected
    results.push(ok)
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${String(status).padEnd(3)} (expected ${expected})  ${name}`)
  }

  const attendee = await identityToolkit('signInWithPassword', { email: SEED_ACCOUNTS.attendee.email, password })
  const coordinator = await identityToolkit('signInWithPassword', { email: SEED_ACCOUNTS.coordinator.email, password })

  // Rules can take a moment to propagate after a deploy. Wait for the eventRequests lock before any
  // write check, so a permitted write is never tested against the previous ruleset.
  const startedAt = Date.now()
  let lockStatus
  while (Date.now() - startedAt < PROPAGATION_TIMEOUT_MS) {
    lockStatus = await firestore(attendee.idToken, 'GET', 'eventRequests/seed-req-a1-confirmed')
    if (lockStatus === 403) break
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  if (lockStatus !== 403) {
    console.error(`\neventRequests is still readable from the browser (${lockStatus}). Are the current rules deployed?`)
    process.exitCode = 1
    return
  }

  console.log('\neventRequests — the browser has no access, whatever the role:')
  record('attendee reads a confirmed event', await firestore(attendee.idToken, 'GET', 'eventRequests/seed-req-a1-confirmed'), 403)
  record('attendee lists the collection', await firestore(attendee.idToken, 'GET', 'eventRequests'), 403)
  record('coordinator reads a submitted request', await firestore(coordinator.idToken, 'GET', 'eventRequests/seed-req-a1-submitted'), 403)
  record(
    'coordinator writes to a request',
    await firestore(coordinator.idToken, 'PATCH', 'eventRequests/seed-req-a1-submitted?updateMask.fieldPaths=core', {
      fields: { core: { mapValue: { fields: { title: string('rules check') } } } },
    }),
    403,
  )

  console.log('\nusers/{uid} — own document only, and roles are not self-assignable:')
  const own = `users/${attendee.localId}`
  record('attendee reads their own profile', await firestore(attendee.idToken, 'GET', own), 200)
  record("attendee reads another user's profile", await firestore(attendee.idToken, 'GET', 'users/seed-coordinator'), 403)
  record('attendee lists all profiles', await firestore(attendee.idToken, 'GET', 'users'), 403)
  record('attendee grants themselves another role', await firestore(attendee.idToken, 'PATCH', `${own}?updateMask.fieldPaths=roles`, { fields: { roles: list('organiser') } }), 403)
  record('attendee sets an organisation ID', await firestore(attendee.idToken, 'PATCH', `${own}?updateMask.fieldPaths=organisationId`, { fields: { organisationId: string('SEED-ORG-A') } }), 403)
  record('attendee edits their own name', await firestore(attendee.idToken, 'PATCH', `${own}?updateMask.fieldPaths=name`, { fields: { name: string('Seed Attendee (rules check)') } }), 200)
  record('attendee restores their own name', await firestore(attendee.idToken, 'PATCH', `${own}?updateMask.fieldPaths=name`, { fields: { name: string(SEED_ACCOUNTS.attendee.name) } }), 200)
  record('attendee deletes their own profile', await firestore(attendee.idToken, 'DELETE', own), 403)
  record("attendee creates someone else's profile", await firestore(attendee.idToken, 'POST', 'users?documentId=rules-check-not-mine', { fields: { roles: list('attendee') } }), 403)

  console.log('\nRegistration path — a new account may only self-register as organiser or attendee:')
  const temporaryEmail = `rules-check-${Date.now()}@seed.connectsphere.test`
  const temporary = await identityToolkit('signUp', { email: temporaryEmail, password })
  try {
    const profilePath = `users?documentId=${temporary.localId}`
    record('new user registers as a coordinator', await firestore(temporary.idToken, 'POST', profilePath, { fields: { name: string('x'), email: string(temporaryEmail), role: string('coordinator'), roles: list('coordinator') } }), 403)
    record('new user registers with role and roles disagreeing', await firestore(temporary.idToken, 'POST', profilePath, { fields: { name: string('x'), email: string(temporaryEmail), role: string('organiser'), roles: list('attendee') } }), 403)
    record('new user registers as an attendee, as the form does', await firestore(temporary.idToken, 'POST', profilePath, { fields: { name: string('Rules Check'), email: string(temporaryEmail), role: string('attendee'), roles: list('attendee') } }), 200)
  } finally {
    await getAdminDb().collection('users').doc(temporary.localId).delete()
    await getAdminAuth().deleteUser(temporary.localId)
    console.log(`\ncleanup: removed the temporary Auth user and users/${temporary.localId}`)
  }

  const profile = (await getAdminDb().collection('users').doc(SEED_ACCOUNTS.attendee.uid).get()).data()
  const intact = profile.name === SEED_ACCOUNTS.attendee.name && profile.organisationId === undefined && JSON.stringify(profile.roles) === JSON.stringify(SEED_ACCOUNTS.attendee.roles)
  console.log(`seeded attendee profile unchanged: ${intact}`)

  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} checks passed against the deployed rules.`)
  if (passed !== results.length || !intact) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
