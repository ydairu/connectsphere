// SPM-45 and SPM-27, presentation side: the request page and the requests list. The API is mocked; the rules
// and records are covered in tests/spm-45 and tests/spm-27.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../context/auth-context.js'
import RequestDetailPage from './RequestDetailPage.jsx'
import RequestsPage from './RequestsPage.jsx'

vi.mock('../services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), listRequests: vi.fn(), transitionRequest: vi.fn() }
})

const { getRequest, listRequests, transitionRequest } = await import('../services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const underReview = { id: 'req-1', status: 'under_review', core: { title: 'A1 under review' } }
const confirmed = { id: 'req-2', status: 'confirmed', core: { title: 'A1 confirmed' } }
const REASON = 'No venue can hold 500 attendees on that date'

function renderAt(path, roles) {
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Tester' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/event-requests/new" element={<p>New request form</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

function showRequest(response, roles) {
  getRequest.mockResolvedValue(response)
  return renderAt(`/requests/${response.request.id}`, roles)
}

const dialog = () => screen.getByRole('group', { name: 'Confirm status change' })
const dialogSend = () => dialog().querySelectorAll('button')[1]

describe('SPM-45 — the Coordinator rejects with a reason', () => {
  // AC: "when the Event Coordinator selects Reject, then they are prompted to enter a rejection reason".
  it('spm45_selecting_reject_prompts_for_a_reason_and_blocks_sending_without_one', async () => {
    const user = showRequest({ request: underReview, editableSections: [], availableActions: ['reject'] }, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Reject request' }))

    expect(screen.getByLabelText('Rejection reason (required)')).toBeTruthy()
    expect(screen.getByText('Enter a rejection reason to continue.')).toBeTruthy()
    expect(screen.getByText(/cannot be edited or resubmitted; the organiser would need to create a new request/)).toBeTruthy()
    expect(dialogSend().disabled).toBe(true)

    await user.type(screen.getByLabelText('Rejection reason (required)'), '   ')
    expect(dialogSend().disabled).toBe(true)
    expect(transitionRequest).not.toHaveBeenCalled()
  })

  it('spm45_confirming_with_a_reason_sends_it_and_shows_the_closed_request', async () => {
    const user = showRequest({ request: underReview, editableSections: [], availableActions: ['reject'] }, ['coordinator'])
    transitionRequest.mockResolvedValue({
      request: { ...underReview, status: 'rejected' },
      editableSections: [],
      availableActions: [],
      rejection: { reason: REASON, rejectedAt: '2026-10-04T02:00:00.000Z', previousStatus: 'under_review' },
    })
    await user.click(await screen.findByRole('button', { name: 'Reject request' }))
    await user.type(screen.getByLabelText('Rejection reason (required)'), `  ${REASON}  `)
    await user.click(dialogSend())

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', 'reject', REASON)
    expect(await screen.findByText('Status changed to Rejected.')).toBeTruthy()
    expect(screen.getByText('Rejected', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Request rejected' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Status actions' })).toBeNull()
  })
})

describe('SPM-45 — the Organiser sees a rejected request as closed', () => {
  const rejected = {
    request: { ...underReview, status: 'rejected' },
    editableSections: [],
    availableActions: [],
    rejection: { reason: REASON, rejectedAt: '2026-10-04T02:00:00.000Z', previousStatus: 'planning' },
  }

  // AC: "it is clearly marked as Rejected and the rejection reason is displayed."
  it('spm45_the_organiser_sees_rejected_the_reason_the_stage_and_that_it_is_closed', async () => {
    showRequest(rejected, ['organiser'])
    expect(await screen.findByText('Rejected', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Request rejected' })).toBeTruthy()
    expect(screen.getByText('This request is closed. It cannot be edited or resubmitted.')).toBeTruthy()
    expect(screen.getByText(REASON)).toBeTruthy()
    expect(screen.getByText('Planning')).toBeTruthy()
    expect(screen.getByText('Rejected on')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resubmit request' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  // AC: "when the Organiser wants to pursue the event with different requirements, then they must create a
  // new event request".
  it('spm45_the_organiser_is_pointed_to_create_a_new_request', async () => {
    const user = showRequest(rejected, ['organiser'])
    await user.click(await screen.findByRole('link', { name: 'create a new event request' }))
    expect(await screen.findByText('New request form')).toBeTruthy()
  })

  it('spm45_staff_see_the_reason_but_no_new_request_link', async () => {
    showRequest(rejected, ['venue_staff'])
    expect(await screen.findByText(REASON)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'create a new event request' })).toBeNull()
  })
})

describe('SPM-27 — the Coordinator marks an event completed', () => {
  // AC: "when the Event Coordinator selects Mark as Completed, then the event status changes to Completed".
  it('spm27_mark_as_completed_asks_first_then_shows_completed', async () => {
    const user = showRequest({ request: confirmed, editableSections: [], availableActions: ['complete'] }, ['coordinator'])
    await user.click(await screen.findByRole('button', { name: 'Mark as completed' }))
    expect(screen.getByText(/A completed event cannot change status again/)).toBeTruthy()
    expect(screen.queryByLabelText(/reason/i)).toBeNull()
    expect(transitionRequest).not.toHaveBeenCalled()

    transitionRequest.mockResolvedValue({
      request: { ...confirmed, status: 'completed' },
      editableSections: [],
      availableActions: [],
      completion: { completedAt: '2026-11-21T01:00:00.000Z', completedByName: 'Seed Coordinator 3' },
    })
    await user.click(dialogSend())

    expect(transitionRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-2', 'complete', undefined)
    expect(await screen.findByText('Status changed to Completed.')).toBeTruthy()
    expect(screen.getByText('Completed', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Event completed' })).toBeTruthy()
    expect(screen.getByText('Seed Coordinator 3')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Status actions' })).toBeNull()
  })

  it('spm27_mark_as_completed_is_not_offered_when_the_api_does_not_list_it', async () => {
    showRequest({ request: confirmed, editableSections: [], availableActions: ['cancel'] }, ['coordinator'])
    expect(await screen.findByRole('button', { name: 'Cancel event' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark as completed' })).toBeNull()
  })

  it('spm27_the_organiser_sees_when_it_was_completed_but_not_by_whom', async () => {
    showRequest(
      { request: { ...confirmed, status: 'completed' }, editableSections: [], availableActions: [], completion: { completedAt: '2026-11-21T01:00:00.000Z' } },
      ['organiser'],
    )
    expect(await screen.findByRole('heading', { name: 'Event completed' })).toBeTruthy()
    expect(screen.getByText('Marked completed on')).toBeTruthy()
    expect(screen.queryByText('Marked completed by')).toBeNull()
  })
})

describe('SPM-27 / SPM-45 — Completed and Rejected events leave the active list', () => {
  // AC (SPM-27): "Given a Completed event, when viewed in the event list, then it is clearly labelled as
  // Completed and is not shown in the active planning queue".
  it('spm27_a_completed_event_is_labelled_completed_under_closed_events_only', async () => {
    listRequests.mockResolvedValue({
      requests: [confirmed, { id: 'req-3', status: 'completed', core: { title: 'A1 completed' } }, { id: 'req-4', status: 'rejected', core: { title: 'A1 rejected' } }],
    })
    renderAt('/requests', ['coordinator'])
    const closed = await screen.findByRole('region', { name: 'Closed events' })
    const active = screen.getAllByRole('list').find((element) => !closed.contains(element))

    for (const [title, label] of [['A1 completed', 'Completed'], ['A1 rejected', 'Rejected']]) {
      const item = [...closed.querySelectorAll('li')].find((li) => li.textContent.includes(title))
      expect(item?.querySelector('.status-pill')?.textContent, title).toBe(label)
      expect(active.textContent).not.toContain(title)
    }
    expect(active.textContent).toContain('A1 confirmed')
  })
})
