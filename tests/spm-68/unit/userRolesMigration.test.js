// SPM-68 — the roles migration script recognises the Event Coordinator Lead role, so a provisioned Lead profile
// is not reported as carrying an unrecognised role. The migration itself is SPM-42's
// (tests/spm-42/unit/userRolesMigration.test.js).

import { describe, expect, it } from 'vitest'

import { planUserMigration } from '../../../backend/scripts/userRolesMigration.js'
import { COORDINATOR, COORDINATOR_LEAD } from '../../../shared/permissions.js'

describe('SPM-68 — roles migration and the Event Coordinator Lead', () => {
  it('a legacy single-role Lead profile gains a roles array with no problems', () => {
    const plan = planUserMigration('lead', { email: 'lead@x.test', role: COORDINATOR_LEAD })
    expect(plan.update).toEqual({ roles: [COORDINATOR_LEAD] })
    expect(plan.problems).toEqual([])
  })

  it('a migrated Lead + Coordinator profile needs nothing', () => {
    const plan = planUserMigration('lead-coordinator', { email: 'lc@x.test', roles: [COORDINATOR_LEAD, COORDINATOR] })
    expect(plan.update).toEqual({})
    expect(plan.problems).toEqual([])
  })
})
