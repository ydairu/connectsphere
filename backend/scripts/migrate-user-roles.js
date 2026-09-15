// Backfills users/{uid}: role -> roles[], and organisationId + organisationName on organiser accounts.
// SPM-42. Planning rules live in userRolesMigration.js (pure, unit-tested).
//
// Usage (from the repo root):
//   node backend/scripts/migrate-user-roles.js [--organisations=<file.json>]
//   node backend/scripts/migrate-user-roles.js [--organisations=<file.json>] --write --project=<projectId>
//
// Dry run by default: it prints every planned change and writes nothing. With --write it still prints
// the full plan first, then applies it. Idempotent: an already migrated document plans no change.
//
// The organisations file maps existing organiser accounts to the company they belong to. Registration
// never collected this, so it has to come from the team — the script will not invent one:
//   { "organiser@example.com": { "organisationId": "ACME-001", "organisationName": "Acme Ltd" },
//     "<uid>":                 { "organisationId": "...",      "organisationName": "..." } }
// It holds real account emails: keep it outside the repository.

import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { env } from '../src/config/env.js'
import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { normaliseOrganisations, planUserMigration } from './userRolesMigration.js'
import { banner, resolveWriteMode } from './writeGuard.js'

const BATCH_LIMIT = 500 // Firestore's maximum writes per batch

async function main() {
  const { values } = parseArgs({
    options: {
      write: { type: 'boolean', default: false },
      project: { type: 'string' },
      organisations: { type: 'string' },
    },
    strict: true,
  })

  const mode = resolveWriteMode(values, env.firebaseProjectId)
  console.log(banner('migrate-user-roles — SPM-42', env.firebaseProjectId, mode))
  if (!mode.ok) {
    console.error(`\n${mode.message}`)
    process.exitCode = 1
    return
  }

  const organisations = values.organisations
    ? normaliseOrganisations(JSON.parse(await readFile(values.organisations, 'utf8')))
    : {}
  console.log(`Organisations file: ${values.organisations ?? '(none — organiser organisation fields will be reported, not filled)'}`)

  const snapshot = await getAdminDb().collection('users').get()
  const plans = snapshot.docs.map((doc) => ({ doc, plan: planUserMigration(doc.id, doc.data(), organisations) }))
  const changing = plans.filter(({ plan }) => Object.keys(plan.update).length > 0)

  console.log(`\nusers documents read: ${snapshot.size}`)
  for (const { doc, plan } of plans) {
    const changes = Object.keys(plan.update).length > 0 ? JSON.stringify(plan.update) : 'no change'
    console.log(`\n  users/${doc.id}  <${plan.email ?? 'no email'}>`)
    console.log(`    current: role=${JSON.stringify(doc.get('role'))} roles=${JSON.stringify(doc.get('roles'))} organisationId=${JSON.stringify(doc.get('organisationId'))}`)
    console.log(`    plan:    ${changes}`)
    for (const problem of plan.problems) console.log(`    ! ${problem}`)
  }

  const problemCount = plans.reduce((count, { plan }) => count + plan.problems.length, 0)
  console.log(`\nSummary: ${changing.length} document(s) to update, ${plans.length - changing.length} unchanged, ${problemCount} problem(s) reported.`)

  if (!mode.write) {
    console.log(`\nDry run — nothing was written. To apply: --write --project=${env.firebaseProjectId}`)
    return
  }
  if (changing.length === 0) {
    console.log('\nNothing to write.')
    return
  }

  // lastUpdateTime precondition: if a document changed after it was read, that write fails instead of
  // applying a plan computed from stale data. Re-run to re-plan.
  let written = 0
  for (let start = 0; start < changing.length; start += BATCH_LIMIT) {
    const batch = getAdminDb().batch()
    for (const { doc, plan } of changing.slice(start, start + BATCH_LIMIT)) {
      batch.update(doc.ref, plan.update, { lastUpdateTime: doc.updateTime })
    }
    await batch.commit()
    written += Math.min(BATCH_LIMIT, changing.length - start)
  }
  console.log(`\nWrote ${written} document(s) to project ${env.firebaseProjectId}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
