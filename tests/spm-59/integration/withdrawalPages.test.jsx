// SPM-59, presentation side: Withdraw (with its confirmation), the invitation card with Accept and Decline, Leave
// waiting list, the statuses on "My registrations", and the invitation notice's link. The API is mocked; who may do
// what is covered by withdrawalApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import AttendeeRegistration from '../../../frontend/src/components/AttendeeRegistration.jsx'
import MyRegistrationsPage from '../../../frontend/src/pages/MyRegistrationsPage.jsx'
import NotificationsPage from '../../../frontend/src/pages/NotificationsPage.jsx'
import { WAITING_LIST_INVITATION_NOTICE } from '../../../shared/notifications.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withdrawRegistration: vi.fn(),
    leaveWaitingList: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    listMyRegistrations: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
  }
})

const { withdrawRegistration, leaveWaitingList, acceptInvitation, declineInvitation, listMyRegistrations, listNotifications } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'att-1' }
const displayed = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const own = (changes) => ({ eventRequestId: 'req-1', eventTitle: 'Partner Forum', eventStartsAt: '2026-11-20T09:00:00.000Z', eventStatus: 'confirmed', venueNames: [], registeredAt: '2026-11-01T00:00:00.000Z', waitingListPosition: null, ...changes })
const base = { canRegister: false, reason: 'already_registered', canJoinWaitingList: false, canWithdraw: false, canRespondToInvitation: false, waitingListPosition: null, opensAt: null, closesAt: null, placesLeft: 0, venueNames: [] }
const expiresAt = '2026-11-03T00:00:00.000Z'

function renderPage(element, path = '/') {
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Ada' }, roles: ['attendee'], loading: false }}>
      <MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={element} /></Routes></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-59 AC1 / AC2 — Withdraw Registration, only where allowed, after confirming', () => {
  it('spm59_a_registered_attendee_confirms_and_withdraws', async () => {
    withdrawRegistration.mockResolvedValue({ registration: own({ status: 'withdrawn' }) })
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...base, canWithdraw: true, myRegistration: own({ status: 'registered' }) }} />)
    await actions.click(screen.getByRole('button', { name: 'Withdraw registration' }))
    expect(withdrawRegistration).not.toHaveBeenCalled()
    await actions.click(screen.getByRole('group', { name: 'Confirm withdrawal' }).querySelector('button'))
    expect(withdrawRegistration).toHaveBeenCalledWith(user, 'req-1')
    expect((await screen.findByRole('status', { name: 'Registration withdrawn' })).textContent).toContain('You have withdrawn from Partner Forum.')
  })

  it('spm59_no_withdraw_button_where_the_organiser_does_not_allow_it', () => {
    renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...base, canWithdraw: false, myRegistration: own({ status: 'registered' }) }} />)
    expect(screen.queryByRole('button', { name: 'Withdraw registration' })).toBeNull()
  })
})

describe('SPM-59 AC3 — the invited Attendee accepts or declines', () => {
  const invited = { ...base, reason: 'invitation_open', canRespondToInvitation: true, myRegistration: own({ status: 'invited', invitationExpiresAt: expiresAt }) }

  it('spm59_the_invitation_shows_its_deadline_and_accepting_registers_them', async () => {
    acceptInvitation.mockResolvedValue({ registration: own({ status: 'registered' }) })
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={invited} />)
    const card = screen.getByRole('status', { name: 'Invitation' })
    expect(card.textContent).toContain(`A place is available. Accept it by ${displayed(expiresAt)}`)
    await actions.click(screen.getByRole('button', { name: 'Accept place' }))
    expect(acceptInvitation).toHaveBeenCalledWith(user, 'req-1')
    expect(await screen.findByRole('status', { name: 'Registration confirmed' })).toBeTruthy()
  })

  it('spm59_declining_says_the_place_passes_on', async () => {
    declineInvitation.mockResolvedValue({ registration: own({ status: 'declined' }) })
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={invited} />)
    await actions.click(screen.getByRole('button', { name: 'Decline' }))
    expect(declineInvitation).toHaveBeenCalledWith(user, 'req-1')
    expect((await screen.findByRole('status', { name: 'Invitation declined' })).textContent).toContain('The place has passed to the next person.')
  })

  it('spm59_the_invitation_notice_links_to_the_event_to_answer_it', async () => {
    listNotifications.mockResolvedValue({ notifications: [{ id: 'n-1', type: WAITING_LIST_INVITATION_NOTICE, eventRequestId: 'req-1', eventTitle: 'Partner Forum', message: 'A place is available for “Partner Forum”. Accept it before your invitation expires, or it passes to the next person.', reason: null, invitationExpiresAt: expiresAt, createdAt: '2026-11-01T00:00:00.000Z', readAt: null }] })
    renderPage(<NotificationsPage />, '/notifications')
    const item = (await screen.findByText(/A place is available/)).closest('li')
    expect(item.textContent).toContain(`Accept by: ${displayed(expiresAt)}`)
    expect(screen.getByRole('link', { name: 'View invitation' }).getAttribute('href')).toBe('/requests/req-1')
  })
})

describe('SPM-59 X7 — leaving the waiting list', () => {
  it('spm59_a_waitlisted_attendee_confirms_and_leaves', async () => {
    leaveWaitingList.mockResolvedValue({ registration: own({ status: 'withdrawn' }) })
    const actions = renderPage(<AttendeeRegistration user={user} requestId="req-1" summary={{ ...base, reason: 'full', waitingListPosition: 2, myRegistration: own({ status: 'waitlisted', waitingListPosition: 2 }) }} />)
    await actions.click(screen.getByRole('button', { name: 'Leave waiting list' }))
    await actions.click(screen.getByRole('group', { name: 'Confirm leaving the waiting list' }).querySelector('button'))
    expect(leaveWaitingList).toHaveBeenCalledWith(user, 'req-1')
    expect((await screen.findByRole('status', { name: 'Left the waiting list' })).textContent).toContain('You have left the waiting list.')
  })
})

describe('SPM-59 AC4 — My registrations shows each status', () => {
  it('spm59_withdrawn_invited_and_expired_are_shown_by_name', async () => {
    listMyRegistrations.mockResolvedValue({
      registrations: [
        own({ eventRequestId: 'a', eventTitle: 'Withdrawn one', status: 'withdrawn' }),
        own({ eventRequestId: 'b', eventTitle: 'Invited one', status: 'invited', invitationExpiresAt: expiresAt }),
        own({ eventRequestId: 'c', eventTitle: 'Expired one', status: 'invitation_expired' }),
        own({ eventRequestId: 'd', eventTitle: 'Declined one', status: 'declined' }),
      ],
    })
    renderPage(<MyRegistrationsPage />)
    const text = (await screen.findByRole('list', { name: 'My registrations' })).textContent
    expect(text).toContain('Status: Withdrawn')
    expect(text).toContain(`Status: Invited, accept by ${displayed(expiresAt)}`)
    expect(text).toContain('Status: Invitation expired')
    expect(text).toContain('Status: Declined')
  })
})
