// SPM-2 AC6 — registration writes users/{uid} from the browser, so the server-side enforcement of
// "internal roles cannot self-register" is firestore.rules. Without the Firestore emulator (needs
// Java) the rules cannot be executed here; this suite checks the deployed rules SOURCE for the
// clauses the criterion depends on and that they agree with the application's own whitelist.
// It is a static check, not rules execution — see the report's unautomated section.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATTENDEE, ORGANISER, ROLES } from '../../../shared/permissions.js'
import { buildRegistrationProfile } from '../../../shared/userProfile.js'
import { INTERNAL_ROLES } from '../fixtures/registrations.js'

const source = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8')
const rules = source.replace(/\/\/.*$/gm, '')

function usersBlock() {
  const match = rules.match(/match \/users\/\{uid\}\s*\{([\s\S]*?)\n\s*\}/)
  expect(match, 'users/{uid} match block').toBeTruthy()
  return match[1]
}

function selfRegistrableRoles() {
  const fn = rules.match(/function selfRegistrable\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)
  expect(fn, 'selfRegistrable() function').toBeTruthy()
  const list = fn[1].match(/hasOnly\(\[([^\]]*)\]\)/)
  expect(list, 'hasOnly([...]) whitelist').toBeTruthy()
  return list[1].split(',').map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
}

describe('SPM-2 AC6 — Firestore rules source (static check, not emulator execution)', () => {
  it('spm2_rules_limit_self_registration_to_event_organiser_and_attendee', () => {
    const roles = selfRegistrableRoles()
    expect([...roles].sort()).toEqual([ATTENDEE, ORGANISER].sort())
    for (const role of INTERNAL_ROLES) expect(roles).not.toContain(role)
  })

  it('spm2_rules_public_roles_match_the_application_whitelist', () => {
    const rulesAllow = selfRegistrableRoles()
    for (const role of ROLES) {
      let applicationAllows = true
      try {
        buildRegistrationProfile({ name: 'n', email: 'e@example.test', role, organisationName: 'Org' })
      } catch {
        applicationAllows = false
      }
      expect(rulesAllow.includes(role), `rules and application agree on ${role}`).toBe(applicationAllows)
    }
  })

  it('spm2_rules_gate_profile_creation_on_self_registrable_and_ownership', () => {
    expect(usersBlock()).toMatch(/allow create:\s*if\s+signedInAs\(uid\)\s*&&\s*selfRegistrable\(request\.resource\.data\)/)
  })

  it('spm2_rules_require_a_non_empty_roles_list_consistent_with_role', () => {
    const fn = rules.match(/function selfRegistrable\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)[1]
    expect(fn).toMatch(/roles is list/)
    expect(fn).toMatch(/roles\.size\(\) > 0/)
    expect(fn).toMatch(/role in profile\.roles/)
  })

  it('spm2_rules_forbid_changing_roles_and_organisation_after_creation', () => {
    const update = usersBlock().match(/allow update:[\s\S]*?hasAny\(\[([^\]]*)\]\)/)
    expect(update, 'update rule with protected keys').toBeTruthy()
    const protectedKeys = update[1].split(',').map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    expect(protectedKeys).toEqual(expect.arrayContaining(['roles', 'role', 'organisationId', 'organisationName']))
    expect(usersBlock()).toMatch(/allow update:\s*if\s+signedInAs\(uid\)/)
  })

  it('spm2_rules_deny_profile_deletion_and_reads_of_other_users', () => {
    expect(usersBlock()).toMatch(/allow read:\s*if\s+signedInAs\(uid\)/)
    expect(usersBlock()).toMatch(/allow delete:\s*if\s+false/)
  })

  it('spm2_rules_keep_event_requests_behind_the_api', () => {
    expect(rules).toMatch(/match \/eventRequests\/\{requestId=\*\*\}\s*\{\s*allow read, write:\s*if\s+false;/)
  })
})
