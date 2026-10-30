// SPM-85 — what the Event Coordinator Leads are told when a request enters the unassigned queue. Pure function:
// newUnassignedRequestNotifications() in shared/notifications.js. That the submit finds the Leads and writes these
// in its transaction is the API suite.

import { describe, expect, it } from 'vitest'

import { NEW_UNASSIGNED_REQUEST_NOTICE, newUnassignedRequestNotifications } from '../../../shared/notifications.js'

const AT = '2026-10-29T02:00:00.000Z'
const organiser = { uid: 'org-1' }
const request = {
  id: 'req-1',
  ownerUid: organiser.uid,
  organisationName: 'Seed Organisation A',
  assignedCoordinatorUid: null,
  core: { title: 'Partner Forum', preferredDateTime: '2026-12-10T14:00:00+08:00', durationHours: 4 },
}
const notify = (event = request, recipientUids = ['lead-1'], actor = organiser) =>
  newUnassignedRequestNotifications(event, actor, { recipientUids, at: AT })

describe('SPM-85 AC1 — the notice names the event, the organisation and the date', () => {
  it('spm85_the_notice_names_the_event_and_organisation_and_carries_the_start', () => {
    expect(notify()).toEqual([{
      recipientUid: 'lead-1',
      type: NEW_UNASSIGNED_REQUEST_NOTICE,
      message: 'New request “Partner Forum” from Seed Organisation A is waiting for assignment.',
      reason: null,
      eventStartsAt: '2026-12-10T14:00:00+08:00',
      eventRequestId: 'req-1',
      eventTitle: 'Partner Forum',
      createdAt: AT,
      readAt: null,
    }])
  })

  it('spm85_without_an_organisation_the_message_drops_from', () => {
    for (const organisationName of [undefined, null, '', '   ']) {
      expect(notify({ ...request, organisationName })[0].message).toBe('New request “Partner Forum” is waiting for assignment.')
    }
  })

  it('spm85_an_untitled_request_still_reads_clearly', () => {
    const [notice] = notify({ ...request, core: { ...request.core, title: '  ' } })
    expect(notice.message).toBe('New request “Untitled event” from Seed Organisation A is waiting for assignment.')
  })

  it('spm85_a_missing_start_is_stored_as_null', () => {
    expect(notify({ ...request, core: { title: 'Partner Forum' } })[0].eventStartsAt).toBeNull()
  })
})

describe('SPM-85 AC2 — each notice identifies its own event', () => {
  it('spm85_two_requests_give_notices_naming_each_event', () => {
    const other = { ...request, id: 'req-2', organisationName: 'Seed Organisation B', core: { ...request.core, title: 'Winter Gala' } }
    const [first] = notify()
    const [second] = notify(other)
    expect(first).toMatchObject({ eventRequestId: 'req-1', eventTitle: 'Partner Forum' })
    expect(second).toMatchObject({ eventRequestId: 'req-2', eventTitle: 'Winter Gala' })
    expect(second.message).toBe('New request “Winter Gala” from Seed Organisation B is waiting for assignment.')
  })
})

describe('SPM-85 — recipients', () => {
  it('spm85_every_lead_gets_exactly_one_notice', () => {
    expect(notify(request, ['lead-1', 'lead-2', 'lead-1']).map((notice) => notice.recipientUid)).toEqual(['lead-1', 'lead-2'])
  })

  it('spm85_a_submitter_who_is_also_a_lead_is_not_notified', () => {
    expect(notify(request, ['org-1', 'lead-2']).map((notice) => notice.recipientUid)).toEqual(['lead-2'])
  })

  it('spm85_no_leads_means_no_notices', () => {
    expect(notify(request, [])).toEqual([])
    expect(newUnassignedRequestNotifications(request, organiser, { at: AT })).toEqual([])
  })
})
