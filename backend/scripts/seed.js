// Seeds Firebase Auth users, users/{uid} profiles and event requests for SPM-42 / SPM-24.
// Data and its rationale: seedData.js (covered offline by seedData.test.js).
//
// Usage (from the repo root):
//   node backend/scripts/seed.js                                  dry run: reads, plans, writes nothing
//   SEED_ACCOUNT_PASSWORD=... node backend/scripts/seed.js --write --project=<projectId>
//
// Writes to the REAL Firebase project named in the root .env. It prints that project ID first, runs a
// read-only preflight, and writes only with --write --project=<id> matching the configured project.
//
// Idempotent: fixed IDs, and each run overwrites seeded documents back to the state in seedData.js
// (including anything changed during a demo) and resets seeded passwords to SEED_ACCOUNT_PASSWORD.
// It refuses to touch anything it did not create: an existing document without this seed's tag, or
// an existing Auth user holding a seeded email under a different uid, aborts the run before any write.
//
// SEED_ACCOUNT_PASSWORD is read from the environment (the root .env works) so no credential is
// committed. Firebase Auth itself rejects passwords under 6 characters.

import { parseArgs } from 'node:util'
import { Timestamp } from 'firebase-admin/firestore'

import { env } from '../src/config/env.js'
import { getAdminAuth, getAdminDb } from '../src/config/firebaseAdmin.js'
import { EVENT_REQUESTS_COLLECTION, SEED_ACCOUNTS, SEED_REQUESTS, SEED_TAG } from './seedData.js'
import { banner, resolveWriteMode } from './writeGuard.js'

const ACCOUNT_CREATED_AT = Timestamp.fromDate(new Date('2026-09-01T00:00:00+08:00'))

async function findAuthUser(lookup) {
  try {
    return await lookup()
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

async function preflight(auth, db) {
  const accounts = []
  const requests = []
  const blockers = []

  for (const account of Object.values(SEED_ACCOUNTS)) {
    const byUid = await findAuthUser(() => auth.getUser(account.uid))
    const byEmail = await findAuthUser(() => auth.getUserByEmail(account.email))
    if (byEmail && byEmail.uid !== account.uid) {
      blockers.push(`Auth user ${byEmail.uid} already holds ${account.email}`)
    }
    const profile = await db.collection('users').doc(account.uid).get()
    if (profile.exists && profile.get('seedTag') !== SEED_TAG) {
      blockers.push(`users/${account.uid} exists and is not tagged ${SEED_TAG}`)
    }
    accounts.push({ account, authAction: byUid ? 'update' : 'create', docAction: profile.exists ? 'overwrite' : 'create' })
  }

  for (const request of SEED_REQUESTS) {
    const snapshot = await db.collection(EVENT_REQUESTS_COLLECTION).doc(request.id).get()
    if (snapshot.exists && snapshot.get('seedTag') !== SEED_TAG) {
      blockers.push(`${EVENT_REQUESTS_COLLECTION}/${request.id} exists and is not tagged ${SEED_TAG}`)
    }
    requests.push({ request, docAction: snapshot.exists ? 'overwrite' : 'create' })
  }

  return { accounts, requests, blockers }
}

function profileDocument(account) {
  const { uid: _uid, ...fields } = account
  return { ...fields, seedTag: SEED_TAG, createdAt: ACCOUNT_CREATED_AT }
}

function requestDocument(request) {
  const { id: _id, createdAt, ...fields } = request
  const timestamp = Timestamp.fromDate(new Date(createdAt))
  return { ...fields, seedTag: SEED_TAG, createdAt: timestamp, updatedAt: timestamp }
}

async function main() {
  const { values } = parseArgs({
    options: { write: { type: 'boolean', default: false }, project: { type: 'string' } },
    strict: true,
  })

  const mode = resolveWriteMode(values, env.firebaseProjectId)
  console.log(banner('seed — SPM-42 / SPM-24 demonstration data', env.firebaseProjectId, mode))
  if (!mode.ok) {
    console.error(`\n${mode.message}`)
    process.exitCode = 1
    return
  }

  const password = process.env.SEED_ACCOUNT_PASSWORD
  if (mode.write && !password) {
    console.error('\nSEED_ACCOUNT_PASSWORD is not set. Nothing was written.')
    process.exitCode = 1
    return
  }
  console.log(`Seed tag: ${SEED_TAG}`)
  console.log(`SEED_ACCOUNT_PASSWORD: ${password ? 'set' : 'not set (required for --write)'}`)

  const auth = getAdminAuth()
  const db = getAdminDb()
  const { accounts, requests, blockers } = await preflight(auth, db)

  console.log(`\nAccounts (${accounts.length}):`)
  for (const { account, authAction, docAction } of accounts) {
    const organisation = account.organisationId ? `  ${account.organisationId}` : ''
    console.log(`  auth:${authAction.padEnd(6)} users/${account.uid}:${docAction.padEnd(9)} ${account.email}  ${JSON.stringify(account.roles)}${organisation}`)
  }
  console.log(`\n${EVENT_REQUESTS_COLLECTION} (${requests.length}):`)
  for (const { request, docAction } of requests) {
    console.log(`  ${docAction.padEnd(9)} ${request.id.padEnd(28)} ${request.status.padEnd(28)} owner=${request.ownerUid}`)
  }

  if (blockers.length > 0) {
    console.error('\nRefusing to continue — these are not this seed\'s to overwrite:')
    for (const blocker of blockers) console.error(`  ! ${blocker}`)
    console.error('Nothing was written.')
    process.exitCode = 1
    return
  }

  if (!mode.write) {
    console.log(`\nDry run — nothing was written. To apply: SEED_ACCOUNT_PASSWORD=... --write --project=${env.firebaseProjectId}`)
    return
  }

  for (const { account, authAction } of accounts) {
    const properties = { email: account.email, password, displayName: account.name }
    if (authAction === 'create') await auth.createUser({ uid: account.uid, ...properties })
    else await auth.updateUser(account.uid, properties)
  }

  const batch = db.batch()
  for (const { account } of accounts) batch.set(db.collection('users').doc(account.uid), profileDocument(account))
  for (const { request } of requests) batch.set(db.collection(EVENT_REQUESTS_COLLECTION).doc(request.id), requestDocument(request))
  await batch.commit()

  console.log(`\nWrote ${accounts.length} Auth users, ${accounts.length} users documents and ${requests.length} ${EVENT_REQUESTS_COLLECTION} documents to ${env.firebaseProjectId}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
