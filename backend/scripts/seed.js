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
//
// SPM-28: it also writes SEED_FIELD_HISTORY into the seeded requests' `activity` subcollections, and with
// --write removes stray field history the live API suite leaves behind. A document is deleted only when
// ALL of these hold: the run has --write; its parent is a seeded request ID; its type is field_changed; and
// it is not one of the SEED_FIELD_HISTORY entries. No other activity type and nothing outside the seeded
// requests is ever deleted.
//
// SPM-16: it also writes SEED_VENUES and SEED_VENUE_AVAILABILITY (a venue with setup and turnaround times
// holding a confirmed booking, an active tentative hold and an expired one), with the same tag checks.
// SPM-17: and SEED_EQUIPMENT_TYPES, SEED_EQUIPMENT_UNITS and SEED_EQUIPMENT_REQUESTS.

import { parseArgs } from 'node:util'
import { Timestamp } from 'firebase-admin/firestore'

import { env } from '../src/config/env.js'
import { getAdminAuth, getAdminDb } from '../src/config/firebaseAdmin.js'
import { FIELD_CHANGED } from '../../shared/changeHistory.js'
import { ACTIVITY_SUBCOLLECTION } from '../src/services/coordinatorAssignmentService.js'
import {
  EVENT_REQUESTS_COLLECTION,
  SEED_ACCOUNTS,
  SEED_FIELD_HISTORY,
  SEED_REQUESTS,
  SEED_TAG,
  SEED_EQUIPMENT_REQUESTS,
  SEED_EQUIPMENT_TYPES,
  SEED_EQUIPMENT_UNITS,
  SEED_VENUE_AVAILABILITY,
  SEED_VENUES,
  EQUIPMENT_REQUESTS_COLLECTION,
  EQUIPMENT_TYPES_COLLECTION,
  EQUIPMENT_UNITS_COLLECTION,
  VENUE_AVAILABILITY_COLLECTION,
  VENUES_COLLECTION,
} from './seedData.js'
import { removableFieldHistory } from './seedHistory.js'
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

  // SPM-28: the seeded history entries, and the stray field history that --write would remove.
  const history = []
  const strays = []
  for (const request of SEED_REQUESTS) {
    const activity = db.collection(EVENT_REQUESTS_COLLECTION).doc(request.id).collection(ACTIVITY_SUBCOLLECTION)
    for (const entry of SEED_FIELD_HISTORY[request.id] ?? []) {
      const snapshot = await activity.doc(entry.id).get()
      if (snapshot.exists && snapshot.get('seedTag') !== SEED_TAG) {
        blockers.push(`${activity.path}/${entry.id} exists and is not tagged ${SEED_TAG}`)
      }
      history.push({ request, entry, docAction: snapshot.exists ? 'overwrite' : 'create' })
    }
    // Counted on a dry run too (as if --write), so the plan shows what --write would remove.
    const fieldChanges = await activity.where('type', '==', FIELD_CHANGED).get()
    const removable = new Set(removableFieldHistory({
      write: true,
      requestId: request.id,
      entries: fieldChanges.docs.map((doc) => ({ id: doc.id, type: doc.get('type') })),
    }))
    const refs = fieldChanges.docs.filter((doc) => removable.has(doc.id)).map((doc) => doc.ref)
    if (refs.length > 0) strays.push({ request, refs })
  }

  // SPM-16: venues and their venueAvailability entries. SPM-37 / SPM-17: equipment types, units and requests.
  const venueDocuments = []
  for (const [collection, documents] of [
    [VENUES_COLLECTION, SEED_VENUES],
    [VENUE_AVAILABILITY_COLLECTION, SEED_VENUE_AVAILABILITY],
    [EQUIPMENT_TYPES_COLLECTION, SEED_EQUIPMENT_TYPES],
    [EQUIPMENT_UNITS_COLLECTION, SEED_EQUIPMENT_UNITS],
    [EQUIPMENT_REQUESTS_COLLECTION, SEED_EQUIPMENT_REQUESTS],
  ]) {
    for (const document of documents) {
      const snapshot = await db.collection(collection).doc(document.id).get()
      if (snapshot.exists && snapshot.get('seedTag') !== SEED_TAG) {
        blockers.push(`${collection}/${document.id} exists and is not tagged ${SEED_TAG}`)
      }
      venueDocuments.push({ collection, document, docAction: snapshot.exists ? 'overwrite' : 'create' })
    }
  }

  return { accounts, requests, history, strays, venueDocuments, blockers }
}

function profileDocument(account) {
  const { uid: _uid, ...fields } = account
  return { ...fields, seedTag: SEED_TAG, createdAt: ACCOUNT_CREATED_AT }
}

function historyDocument(entry) {
  const { id: _id, at, ...fields } = entry
  return { ...fields, seedTag: SEED_TAG, at: Timestamp.fromDate(new Date(at)) }
}

function venueDocument(document) {
  const { id: _id, ...fields } = document
  return { ...fields, seedTag: SEED_TAG }
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
  const { accounts, requests, history, strays, venueDocuments, blockers } = await preflight(auth, db)

  console.log(`\nAccounts (${accounts.length}):`)
  for (const { account, authAction, docAction } of accounts) {
    const organisation = account.organisationId ? `  ${account.organisationId}` : ''
    console.log(`  auth:${authAction.padEnd(6)} users/${account.uid}:${docAction.padEnd(9)} ${account.email}  ${JSON.stringify(account.roles)}${organisation}`)
  }
  console.log(`\n${EVENT_REQUESTS_COLLECTION} (${requests.length}):`)
  for (const { request, docAction } of requests) {
    console.log(`  ${docAction.padEnd(9)} ${request.id.padEnd(28)} ${request.status.padEnd(28)} owner=${request.ownerUid}`)
  }

  console.log(`\nField history (${history.length} seeded entries):`)
  for (const { request, entry, docAction } of history) {
    console.log(`  ${docAction.padEnd(9)} ${request.id}/${ACTIVITY_SUBCOLLECTION}/${entry.id}  ${entry.field}`)
  }
  console.log(`Stray ${FIELD_CHANGED} entries under seeded requests${mode.write ? ' (to remove)' : ' (--write would remove)'}:`)
  if (strays.length === 0) console.log('  none')
  for (const { request, refs } of strays) console.log(`  ${request.id}: ${refs.length}`)

  console.log(`\nVenues, availability and equipment (${venueDocuments.length}):`)
  for (const { collection, document, docAction } of venueDocuments) {
    const detail = collection === EQUIPMENT_TYPES_COLLECTION ? document.name
      : collection === EQUIPMENT_UNITS_COLLECTION ? `${document.assetTag}  ${document.status}  type=${document.equipmentTypeId}`
      : collection === EQUIPMENT_REQUESTS_COLLECTION ? `${document.status}  event=${document.eventRequestId}  items=${document.items.length}  replaces=${document.replacesId ?? 'none'}`
      : document.status
      ? `${document.status.padEnd(18)} ${document.startsAt} to ${document.endsAt}${document.holdExpiresAt ? `  expires ${document.holdExpiresAt}` : ''}  event=${document.eventRequestId ?? 'none'}`
      : `setup ${document.setupMinutes} min, turnaround ${document.turnaroundMinutes} min`
    console.log(`  ${docAction.padEnd(9)} ${collection}/${document.id}  ${detail}`)
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
  for (const { request, entry } of history) {
    batch.set(db.collection(EVENT_REQUESTS_COLLECTION).doc(request.id).collection(ACTIVITY_SUBCOLLECTION).doc(entry.id), historyDocument(entry))
  }
  for (const { collection, document } of venueDocuments) batch.set(db.collection(collection).doc(document.id), venueDocument(document))
  await batch.commit()

  // Removal in batches of at most 500 writes, Firestore's limit. Re-checked with the real --write flag
  // (guardrail 1); every ref already passed guardrails 2–4 in removableFieldHistory().
  const removed = []
  for (const { request, refs } of strays) {
    if (removableFieldHistory({ write: mode.write, requestId: request.id, entries: refs.map((ref) => ({ id: ref.id, type: FIELD_CHANGED })) }).length !== refs.length) {
      throw new Error(`Refusing to delete activity under ${request.id}: guardrail check failed`)
    }
    for (let start = 0; start < refs.length; start += 500) {
      const deletions = db.batch()
      for (const ref of refs.slice(start, start + 500)) deletions.delete(ref)
      await deletions.commit()
    }
    removed.push(`${request.id}: ${refs.length}`)
  }

  console.log(`\nWrote ${accounts.length} Auth users, ${accounts.length} users documents, ${requests.length} ${EVENT_REQUESTS_COLLECTION} documents, ${history.length} field history entries and ${venueDocuments.length} venue, availability and equipment documents to ${env.firebaseProjectId}.`)
  console.log(`Removed stray ${FIELD_CHANGED} entries: ${removed.length === 0 ? 'none' : removed.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
