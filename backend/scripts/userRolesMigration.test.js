// SPM-42 — users/{uid} roles migration planning.
// Run: node --test "backend/scripts/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ATTENDEE, ORGANISER, VENUE_STAFF, TECHNICAL_STAFF } from '../../shared/permissions.js'
import { normaliseOrganisations, planUserMigration } from './userRolesMigration.js'

const ACME = { organisationId: 'ACME-001', organisationName: 'Acme Ltd' }

function applied(data, plan) {
  return { ...data, ...plan.update }
}

describe('SPM-42 — users/{uid} roles migration', () => {
  test('Single-role attendee account gains a one-element roles array and keeps its legacy role', () => {
    const plan = planUserMigration('u1', { email: 'a@x.test', role: ATTENDEE })
    assert.deepEqual(plan.update, { roles: [ATTENDEE] })
    assert.deepEqual(plan.problems, [])
  })

  test('Organiser account gains organisationId and organisationName from the organisations file, matched by email', () => {
    const plan = planUserMigration('u2', { email: 'Org@X.test', role: ORGANISER }, normaliseOrganisations({ 'org@x.test': ACME }))
    assert.deepEqual(plan.update, { roles: [ORGANISER], ...ACME })
    assert.deepEqual(plan.problems, [])
  })

  test('Re-running the migration on an already migrated account changes nothing', () => {
    const organisations = normaliseOrganisations({ u2: ACME })
    const original = { email: 'org@x.test', role: ORGANISER }
    const once = applied(original, planUserMigration('u2', original, organisations))
    const twice = planUserMigration('u2', once, organisations)
    assert.deepEqual(twice.update, {})
    assert.deepEqual(twice.problems, [])
  })

  test('Organiser with no organisations file entry is reported and gets no placeholder organisation', () => {
    const plan = planUserMigration('u3', { email: 'lone@x.test', role: ORGANISER })
    assert.deepEqual(plan.update, { roles: [ORGANISER] })
    assert.equal(Object.hasOwn(plan.update, 'organisationId'), false)
    assert.equal(plan.problems.length, 2)
  })

  test('Existing organisationId is never overwritten by a disagreeing file entry', () => {
    const data = { email: 'org@x.test', roles: [ORGANISER], organisationId: 'OLD-9', organisationName: 'Acme Ltd' }
    const plan = planUserMigration('u4', data, normaliseOrganisations({ u4: ACME }))
    assert.deepEqual(plan.update, {})
    assert.match(plan.problems.join('\n'), /organisationId is already "OLD-9"/)
  })

  test('Existing multi-role array is left untouched', () => {
    const plan = planUserMigration('u5', { email: 's@x.test', role: VENUE_STAFF, roles: [VENUE_STAFF, TECHNICAL_STAFF] })
    assert.deepEqual(plan.update, {})
  })

  test('Legacy role value outside the five customer roles is copied as stored and reported, not renamed', () => {
    const plan = planUserMigration('u6', { email: 'e@x.test', role: 'employee' })
    assert.deepEqual(plan.update, { roles: ['employee'] })
    assert.match(plan.problems.join('\n'), /unrecognised role value/)
  })

  test('A string stored in roles is reported and left unchanged', () => {
    const plan = planUserMigration('u7', { email: 'bad@x.test', roles: ORGANISER })
    assert.deepEqual(plan.update, {})
    assert.match(plan.problems.join('\n'), /not an array/)
  })

  test('Organisations file entry missing organisationId is rejected before anything is planned', () => {
    assert.throws(() => normaliseOrganisations({ 'org@x.test': { organisationName: 'Acme Ltd' } }), /organisationId/)
  })
})
