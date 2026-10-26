// Walkthrough fix B — the seed has a Confirmed event that has already taken place, so "Mark as completed"
// (SPM-27) can be demonstrated. Offline: the seed data and shared/statusTransitions.js only.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS, SEED_VENUE_AVAILABILITY } from '../../../backend/scripts/seedData.js'
import { PREPARATION } from '../../../shared/status.js'
import { CANCEL, COMPLETE, availableActions, eventHasEnded } from '../../../shared/statusTransitions.js'

const NOW = new Date('2026-10-18T00:00:00.000Z')
const past = SEED_REQUESTS.find((request) => request.id === 'seed-req-a1-confirmed-past')

describe('Seed data — past Preparation event for SPM-27', () => {
  it('spm27_seed_past_event_is_in_preparation_owned_by_a1_and_assigned_to_seed_coordinator', () => {
    expect(past).toMatchObject({ status: PREPARATION, ownerUid: SEED_ACCOUNTS.organiserA1.uid, assignedCoordinatorUid: SEED_ACCOUNTS.coordinator.uid })
    expect(past.core.preferredDateTime).toBe('2026-10-01T09:00:00+08:00')
    expect(past.arrangementApprovals).toMatchObject({ venue: { decision: 'approved' }, technical: { decision: 'approved' } })
  })

  it('spm27_seed_past_event_has_ended_so_its_coordinator_may_mark_it_completed', () => {
    expect(eventHasEnded(past, NOW)).toBe(true)
    const actions = availableActions(SEED_ACCOUNTS.coordinator, past, NOW)
    expect(actions).toContain(COMPLETE)
    // It has started, so it can no longer be cancelled.
    expect(actions).not.toContain(CANCEL)
    expect(availableActions(SEED_ACCOUNTS.coordinator3, past, NOW)).not.toContain(COMPLETE)
  })

  it('spm27_seed_past_event_has_no_venue_booking_or_hold', () => {
    expect(SEED_VENUE_AVAILABILITY.filter((entry) => entry.eventRequestId === past.id)).toEqual([])
  })
})
