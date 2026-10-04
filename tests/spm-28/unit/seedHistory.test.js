// SPM-28 — the seeded change history, and the guardrails on what seed.js may delete from the real project
// (backend/scripts/seedHistory.js). Offline: nothing here touches Firebase.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_FIELD_HISTORY, SEED_ID_PREFIX, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { removableFieldHistory } from '../../../backend/scripts/seedHistory.js'
import { FIELD_CHANGED, visibleChangeHistory } from '../../../shared/changeHistory.js'

const PLANNING_ID = 'seed-req-a1-planning'
const planning = SEED_REQUESTS.find((request) => request.id === PLANNING_ID)
const seeded = SEED_FIELD_HISTORY[PLANNING_ID]

describe('SPM-28 — seeded change history', () => {
  it('seed-req-a1-planning has three field_changed entries with fixed, prefixed ids, one of them internal', () => {
    expect(Object.keys(SEED_FIELD_HISTORY)).toEqual([PLANNING_ID])
    expect(seeded).toHaveLength(3)
    for (const entry of seeded) {
      expect(entry.type).toBe(FIELD_CHANGED)
      expect(entry.id.startsWith(SEED_ID_PREFIX)).toBe(true)
      expect(Object.keys(entry.actor).sort()).toEqual(['name', 'role', 'type', 'uid'])
    }
    expect(seeded.filter((entry) => entry.field.startsWith('internal.'))).toHaveLength(1)
  })

  it('each newValue is the value seeded on the request, so the history ends at the current record', () => {
    for (const entry of seeded) {
      const [section, name] = entry.field.split('.')
      expect(planning[section][name], entry.field).toEqual(entry.newValue)
    }
  })

  it('the Coordinator sees all three; Organiser A1 sees two', () => {
    expect(visibleChangeHistory(SEED_ACCOUNTS.coordinator, planning, seeded)).toHaveLength(3)
    expect(visibleChangeHistory(SEED_ACCOUNTS.organiserA1, planning, seeded).map((entry) => entry.field)).toEqual(['venue.layoutPreference', 'core.expectedAttendees'])
  })
})

describe('SPM-28 — seed.js deletion guardrails', () => {
  const entries = [
    { id: 'live-run-1', type: FIELD_CHANGED },
    { id: 'live-run-2', type: FIELD_CHANGED },
    { id: seeded[0].id, type: FIELD_CHANGED },
    { id: 'transition-1', type: 'status_changed' },
    { id: 'assign-1', type: 'coordinator_assigned' },
    { id: 'reassign-1', type: 'coordinator_reassigned' },
    { id: 'no-type' },
  ]

  it('with --write, under a seeded request: only non-seeded field_changed entries', () => {
    expect(removableFieldHistory({ write: true, requestId: PLANNING_ID, entries })).toEqual(['live-run-1', 'live-run-2'])
  })

  it.each([false, undefined, 'true', 1])('without --write (%s): nothing', (write) => {
    expect(removableFieldHistory({ write, requestId: PLANNING_ID, entries })).toEqual([])
  })

  it.each(['request-123', 'not-a-seed', `${SEED_ID_PREFIX}req-unknown`])('under a request this seed did not create (%s): nothing', (requestId) => {
    expect(removableFieldHistory({ write: true, requestId, entries })).toEqual([])
  })

  it('never another activity type, and never a seeded entry', () => {
    for (const request of SEED_REQUESTS) {
      const removable = removableFieldHistory({ write: true, requestId: request.id, entries })
      expect(removable).not.toContain(seeded[0].id)
      for (const id of ['transition-1', 'assign-1', 'reassign-1', 'no-type']) expect(removable).not.toContain(id)
    }
  })
})
