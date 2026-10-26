// SPM-8 — coordinator selection rule, at the pure-function level. The Firestore-backed assignment on
// submission is tested in backend/src/services/coordinatorAssignmentService.test.js.
//
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIVE_ASSIGNMENT_STATUSES,
  countActiveAssignments,
  selectCoordinator,
} from './coordinatorAssignment.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  PREPARATION,
  REJECTED,
  RETURNED,
  SUBMITTED,
  UNDER_REVIEW,
} from './status.js'

// mulberry32: a small seeded generator returning [0, 1), so tie-break tests are repeatable.
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const counts = (entries) => new Map(Object.entries(entries))

describe('SPM-8 — active assigned events', () => {
  test('Submitted through Preparation count; Draft and terminal statuses do not', () => {
    assert.deepEqual([...ACTIVE_ASSIGNMENT_STATUSES].sort(), [CONFIRMED, PLANNING, PREPARATION, RETURNED, SUBMITTED, UNDER_REVIEW].sort())

    const requests = [SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED, PREPARATION, DRAFT, COMPLETED, CANCELLED, REJECTED].map(
      (status) => ({ status, assignedCoordinatorUid: 'A' }),
    )
    assert.equal(countActiveAssignments(requests).get('A'), 6)
  })

  test('requests with no coordinator are not counted against anyone', () => {
    const active = countActiveAssignments([{ status: SUBMITTED, assignedCoordinatorUid: null }, { status: PLANNING }])
    assert.equal(active.size, 0)
  })
})

describe('SPM-8 — selectCoordinator', () => {
  test('Test 1: A(2), B(0), C(1) → B', () => {
    const chosen = selectCoordinator({ coordinatorUids: ['A', 'B', 'C'], activeCounts: counts({ A: 2, C: 1 }) })
    assert.equal(chosen, 'B')
  })

  test('Test 2: A(1), B(1), C(3) → only A or B, both reachable across seeds, never C', () => {
    const chosen = new Set()
    for (let seed = 1; seed <= 50; seed += 1) {
      chosen.add(
        selectCoordinator({
          coordinatorUids: ['A', 'B', 'C'],
          activeCounts: counts({ A: 1, B: 1, C: 3 }),
          random: seededRandom(seed),
        }),
      )
    }
    assert.deepEqual([...chosen].sort(), ['A', 'B'])
  })

  test('the same random value picks the same coordinator whatever order they were loaded in', () => {
    const random = () => 0.99
    const first = selectCoordinator({ coordinatorUids: ['A', 'B'], activeCounts: counts({}), random })
    const second = selectCoordinator({ coordinatorUids: ['B', 'A'], activeCounts: counts({}), random })
    assert.equal(first, 'B')
    assert.equal(second, 'B')
  })

  test('the submitter is never chosen, even with the lowest count', () => {
    const chosen = selectCoordinator({
      coordinatorUids: ['X', 'Y'],
      activeCounts: counts({ Y: 4 }),
      excludeUid: 'X',
      random: () => 0,
    })
    assert.equal(chosen, 'Y')
  })

  test('returns null when nobody is eligible', () => {
    assert.equal(selectCoordinator({ coordinatorUids: [], activeCounts: counts({}) }), null)
    assert.equal(selectCoordinator({ coordinatorUids: ['X'], activeCounts: counts({}), excludeUid: 'X' }), null)
  })
})
