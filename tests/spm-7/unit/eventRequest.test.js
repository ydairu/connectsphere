// SPM-7 AC1/AC2/AC3/AC4/AC5/AC6 — shared event-request draft creation rules.

import { describe, expect, it } from 'vitest'

import { DRAFT } from '../../../shared/status.js'
import { buildDraftEventRequest, buildDraftEventRequestUpdate } from '../../../shared/eventRequest.js'

const organiser = Object.freeze({
  uid: 'organiser-1',
  organisationId: 'org-a',
  organisationName: 'Organisation A',
})

describe('SPM-7 — create event request rules (unit)', () => {
  it('spm7_builds_a_draft_request_owned_by_exactly_one_authenticated_organiser', () => {
    const now = new Date('2026-09-15T10:00:00.000Z')
    const { request, errors } = buildDraftEventRequest(
      {
        core: {
          title: 'Annual Partner Forum',
          purpose: 'Partner updates',
          description: 'A half-day event.',
          expectedAttendees: '80',
          durationHours: '4',
          preferredDateTime: '2026-11-20T09:00:00+08:00',
        },
        venue: {
          layoutPreference: 'theatre',
          accessibilityRequired: true,
          accessibilityNeeds: 'Wheelchair access',
        },
        equipment: {
          requirements: 'Projector\nWireless microphone',
          technicalSupportNeeded: true,
        },
        registration: {
          enabled: true,
          notes: 'Registration required for all attendees.',
        },
      },
      organiser,
      now,
    )

    expect(errors).toEqual({})
    expect(request.status).toBe(DRAFT)
    expect(request.ownerUid).toBe(organiser.uid)
    expect(request.organisationId).toBe(organiser.organisationId)
    expect(request.assignedStaffUids).toHaveLength(0)
    expect(request.assignedCoordinatorUid).toBeNull()
    expect(request.core.expectedAttendees).toBe(80)
    expect(request.core.durationHours).toBe(4)
    expect(request.equipment.requirements).toEqual(['Projector', 'Wireless microphone'])
    expect(request.internal.planningNotes).toBe('')
    expect(request.createdAt).toBe(now.toISOString())
    expect(request.updatedAt).toBe(now.toISOString())
  })

  it('spm7_allows_incomplete_unsubmitted_requests_while_preserving_draft_status', () => {
    const { request, errors } = buildDraftEventRequest({}, organiser, new Date('2026-09-15T10:00:00.000Z'))

    expect(errors).toEqual({})
    expect(request.status).toBe(DRAFT)
    expect(request.core.title).toBeNull()
    expect(request.core.expectedAttendees).toBeNull()
    expect(request.venue.layoutPreference).toBeNull()
    expect(request.equipment.requirements).toEqual([])
    expect(request.registration.enabled).toBe(false)
  })

  it('spm7_validates_field_formats_without_requiring_submit_complete_data', () => {
    const { errors } = buildDraftEventRequest(
      {
        core: {
          expectedAttendees: 'ten',
          durationHours: '-1',
          preferredDateTime: 'not-a-date',
        },
      },
      organiser,
    )

    expect(errors['core.expectedAttendees']).toBe('Must be a positive whole number.')
    expect(errors['core.durationHours']).toBe('Must be a positive number.')
    expect(errors['core.preferredDateTime']).toBe('Must be a valid date/time.')
    expect(errors['core.title']).toBeUndefined()
    expect(errors['core.purpose']).toBeUndefined()
  })

  it('spm7_update_input_cannot_alter_owner_status_staff_assignment_or_internal_fields', () => {
    const { update, errors } = buildDraftEventRequestUpdate({
      ownerUid: 'attacker',
      status: 'submitted',
      assignedStaffUids: ['staff-1'],
      internal: { planningNotes: 'should not be accepted' },
      core: { title: 'Updated title' },
    })

    expect(errors).toEqual({})
    expect(update.ownerUid).toBeUndefined()
    expect(update.status).toBeUndefined()
    expect(update.assignedStaffUids).toBeUndefined()
    expect(update.internal).toBeUndefined()
    expect(update.core.title).toBe('Updated title')
  })
})
