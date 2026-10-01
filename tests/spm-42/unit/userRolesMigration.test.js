// SPM-42 — users/{uid} roles migration planning.

import { describe, expect, it } from 'vitest'

import { ATTENDEE, ORGANISER, VENUE_STAFF, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { normaliseOrganisations, planUserMigration } from '../../../backend/scripts/userRolesMigration.js'

const ACME = { organisationId: 'ACME-001', organisationName: 'Acme Ltd' }

function applied(data, plan) {
  return { ...data, ...plan.update }
}

describe('SPM-42 — users/{uid} roles migration', () => {
  it('Single-role attendee account gains a one-element roles array and keeps its legacy role', () => {
    const plan = planUserMigration('u1', { email: 'a@x.test', role: ATTENDEE })
    expect(plan.update).toEqual({ roles: [ATTENDEE] })
    expect(plan.problems).toEqual([])
  })

  it('Organiser account gains organisationId and organisationName from the organisations file, matched by email', () => {
    const plan = planUserMigration('u2', { email: 'Org@X.test', role: ORGANISER }, normaliseOrganisations({ 'org@x.test': ACME }))
    expect(plan.update).toEqual({ roles: [ORGANISER], ...ACME })
    expect(plan.problems).toEqual([])
  })

  it('Re-running the migration on an already migrated account changes nothing', () => {
    const organisations = normaliseOrganisations({ u2: ACME })
    const original = { email: 'org@x.test', role: ORGANISER }
    const once = applied(original, planUserMigration('u2', original, organisations))
    const twice = planUserMigration('u2', once, organisations)
    expect(twice.update).toEqual({})
    expect(twice.problems).toEqual([])
  })

  it('Organiser with no organisations file entry is reported and gets no placeholder organisation', () => {
    const plan = planUserMigration('u3', { email: 'lone@x.test', role: ORGANISER })
    expect(plan.update).toEqual({ roles: [ORGANISER] })
    expect(Object.hasOwn(plan.update, 'organisationId')).toBe(false)
    expect(plan.problems.length).toBe(2)
  })

  it('Existing organisationId is never overwritten by a disagreeing file entry', () => {
    const data = { email: 'org@x.test', roles: [ORGANISER], organisationId: 'OLD-9', organisationName: 'Acme Ltd' }
    const plan = planUserMigration('u4', data, normaliseOrganisations({ u4: ACME }))
    expect(plan.update).toEqual({})
    expect(plan.problems.join('\n')).toMatch(/organisationId is already "OLD-9"/)
  })

  it('Existing multi-role array is left untouched', () => {
    const plan = planUserMigration('u5', { email: 's@x.test', role: VENUE_STAFF, roles: [VENUE_STAFF, TECHNICAL_STAFF] })
    expect(plan.update).toEqual({})
  })

  it('Legacy role value outside the five customer roles is copied as stored and reported, not renamed', () => {
    const plan = planUserMigration('u6', { email: 'e@x.test', role: 'employee' })
    expect(plan.update).toEqual({ roles: ['employee'] })
    expect(plan.problems.join('\n')).toMatch(/unrecognised role value/)
  })

  it('A string stored in roles is reported and left unchanged', () => {
    const plan = planUserMigration('u7', { email: 'bad@x.test', roles: ORGANISER })
    expect(plan.update).toEqual({})
    expect(plan.problems.join('\n')).toMatch(/not an array/)
  })

  it('Organisations file entry missing organisationId is rejected before anything is planned', () => {
    expect(() => normaliseOrganisations({ 'org@x.test': { organisationName: 'Acme Ltd' } })).toThrow(/organisationId/)
  })
})
