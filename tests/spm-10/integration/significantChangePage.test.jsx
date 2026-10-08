// SPM-10, presentation side: on a Planning or Confirmed event, saving a significant field first shows an
// in-page confirmation (not window.confirm) explaining the reset; ordinary edits save at once; after the save
// the page shows the response's status and sign-offs; a refused save is handled by kind (AC7 undoes the
// significant fields only, a 400 keeps all input with errors beside the fields, a stale write reloads the
// record); the change history shows a "Significant" label.
// The API is mocked; the rules are covered by significantChangesApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'
import { ApiRequestError } from '../../../frontend/src/services/api.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn(), getRequestHistory: vi.fn() }
})

const { getRequest, getRequestHistory, updateRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const CORE = { title: 'Partner summit', purpose: 'Partners', description: null, preferredDateTime: '2026-11-20T01:00:00.000Z', durationHours: 4, expectedAttendees: 80 }
const APPROVED = {
  venue: { required: true, decision: 'approved', at: '2026-09-06T04:00:00.000Z' },
  technical: { required: true, decision: 'approved', at: '2026-09-06T04:30:00.000Z' },
}
const AWAITING = { venue: { required: true, decision: null, at: null }, technical: { required: true, decision: null, at: null } }

function response(status, overrides = {}) {
  return {
    request: { id: 'req-1', status, core: CORE, venue: { layoutPreference: 'theatre', accessibilityRequired: false }, equipment: { requirements: ['projector'], technicalSupportNeeded: true } },
    editableSections: ['core', 'venue', 'equipment'],
    availableActions: [],
    arrangements: status === 'planning' || status === 'confirmed' ? APPROVED : null,
    canViewChangeHistory: false,
    ...overrides,
  }
}

function showRequest(body) {
  getRequest.mockResolvedValue(body)
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'Coordinator' }, roles: ['coordinator'], loading: false }}>
      <MemoryRouter initialEntries={['/requests/req-1']}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

async function setAttendees(user, value) {
  const field = await screen.findByLabelText('Expected attendees')
  await user.clear(field)
  await user.type(field, value)
}

const confirmation = () => screen.queryByRole('alertdialog', { name: 'Confirm significant change' })

describe('SPM-10 — the confirmation step', () => {
  it('Confirmed: a significant change asks first, explaining the reset and the move back to Planning; nothing is sent yet', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const user = showRequest(response('confirmed'))
    await setAttendees(user, '120')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = confirmation()
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toMatch(/Expected attendees/)
    expect(dialog.textContent).toMatch(/resets the venue and technical sign-offs to Awaiting approval/)
    expect(dialog.textContent).toMatch(/moves the event back to Planning/)
    expect(updateRequest).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('Planning: the confirmation mentions the reset, not a move back', async () => {
    const user = showRequest(response('planning'))
    await setAttendees(user, '120')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(confirmation().textContent).toMatch(/resets the venue and technical sign-offs/)
    expect(confirmation().textContent).not.toMatch(/moves the event back/)
  })

  it('"Keep editing" closes it, sends nothing and keeps the input', async () => {
    const user = showRequest(response('confirmed'))
    await setAttendees(user, '120')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await user.click(within(confirmation()).getByRole('button', { name: 'Keep editing' }))
    expect(confirmation()).toBeNull()
    expect(updateRequest).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Expected attendees').value).toBe('120')
  })

  it('after confirming, the page shows the new status and the sign-offs Awaiting approval', async () => {
    const user = showRequest(response('confirmed'))
    await setAttendees(user, '120')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    updateRequest.mockResolvedValueOnce(response('planning', { request: { ...response('planning').request, core: { ...CORE, expectedAttendees: 120 } }, arrangements: AWAITING }))
    await user.click(within(confirmation()).getByRole('button', { name: 'Save and reset sign-offs' }))

    await waitFor(() => expect(updateRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', { core: { expectedAttendees: 120 } }))
    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    expect(screen.getByText('Planning', { selector: '.status-pill' })).toBeTruthy()
    expect(screen.getByText('Venue arrangement').nextSibling.textContent).toBe('Awaiting approval')
    expect(screen.getByText('Technical arrangement').nextSibling.textContent).toBe('Awaiting approval')
  })

  it.each(['submitted', 'under_review'])('%s: a significant change saves at once, with no confirmation', async (status) => {
    const user = showRequest(response(status))
    updateRequest.mockResolvedValueOnce(response(status))
    await setAttendees(user, '120')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateRequest).toHaveBeenCalled())
    expect(confirmation()).toBeNull()
  })

  it('an ordinary edit on a Confirmed event saves at once, with no confirmation', async () => {
    const user = showRequest(response('confirmed'))
    updateRequest.mockResolvedValueOnce(response('confirmed'))
    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Partner summit 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', { core: { title: 'Partner summit 2' } }))
    expect(confirmation()).toBeNull()
  })
})

describe('SPM-10 — refused saves', () => {
  const AC7_MESSAGE =
    'This event has an open cancellation request. Decide the cancellation request before changing the date, time, duration, attendance, venue or equipment. Other details can still be edited.'

  it('AC7 on a mixed edit: significant fields go back to their saved values, the ordinary edit is kept, nothing is sent again', async () => {
    const user = showRequest(response('confirmed'))
    await setAttendees(user, '120')
    const layout = screen.getByLabelText('Layout preference')
    await user.clear(layout)
    await user.type(layout, 'banquet')
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Partner summit (renamed)')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    updateRequest.mockRejectedValueOnce(new ApiRequestError('API_REQUEST_FAILED', { status: 409, details: { reason: 'cancellation_request_open', message: AC7_MESSAGE } }))
    await user.click(within(confirmation()).getByRole('button', { name: 'Save and reset sign-offs' }))

    expect(await screen.findByText(`${AC7_MESSAGE} Your significant changes were undone. Other edits are still unsaved.`)).toBeTruthy()
    expect(updateRequest).toHaveBeenCalledTimes(1)
    expect(updateRequest).toHaveBeenCalledWith({ uid: 'u-1' }, 'req-1', {
      core: { title: 'Partner summit (renamed)', expectedAttendees: 120 },
      venue: { layoutPreference: 'banquet' },
    })
    expect(screen.getByLabelText('Expected attendees').value).toBe('80')
    expect(screen.getByLabelText('Layout preference').value).toBe('theatre')
    expect(screen.getByLabelText('Title').value).toBe('Partner summit (renamed)')
    expect(screen.queryByText(/changed while you were editing/)).toBeNull()
    expect(screen.getByText('Confirmed', { selector: '.status-pill' })).toBeTruthy()
    expect(getRequest).toHaveBeenCalledTimes(1)

    // Saving again sends only the ordinary edit, and without the confirmation step.
    updateRequest.mockResolvedValueOnce(response('confirmed', { request: { ...response('confirmed').request, core: { ...CORE, title: 'Partner summit (renamed)' } } }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateRequest).toHaveBeenLastCalledWith({ uid: 'u-1' }, 'req-1', { core: { title: 'Partner summit (renamed)' } }))
    expect(confirmation()).toBeNull()
  })

  it('AC6 (400): all input is kept and each error is shown beside its field', async () => {
    const user = showRequest(response('under_review'))
    await setAttendees(user, '12.5')
    const duration = screen.getByLabelText('Duration (hours)')
    await user.clear(duration)
    await user.type(duration, '-2')
    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Kept title')

    updateRequest.mockRejectedValueOnce(new ApiRequestError('API_REQUEST_FAILED', {
      status: 400,
      details: { errors: { 'core.expectedAttendees': 'Must be a positive whole number.', 'core.durationHours': 'Must be a positive number.' } },
    }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const attendees = await screen.findByLabelText('Expected attendees')
    await waitFor(() => expect(attendees.getAttribute('aria-invalid')).toBe('true'))
    expect(document.getElementById(attendees.getAttribute('aria-describedby')).textContent).toBe('Must be a positive whole number.')
    const durationField = screen.getByLabelText('Duration (hours)')
    expect(document.getElementById(durationField.getAttribute('aria-describedby')).textContent).toBe('Must be a positive number.')
    expect(screen.getByLabelText('Title').getAttribute('aria-invalid')).toBe('false')

    expect(attendees.value).toBe('12.5')
    expect(durationField.value).toBe('-2')
    expect(screen.getByLabelText('Title').value).toBe('Kept title')
    expect(screen.getByRole('alert').textContent).toMatch(/Please correct:/)
    expect(getRequest).toHaveBeenCalledTimes(1)
  })

  it('stale write (409): the latest saved record is loaded into the form', async () => {
    const user = showRequest(response('planning'))
    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'My unsaved title')

    const latest = response('planning', { request: { ...response('planning').request, core: { ...CORE, title: 'Saved by someone else', expectedAttendees: 95 } } })
    getRequest.mockResolvedValueOnce(latest)
    updateRequest.mockRejectedValueOnce(new ApiRequestError('API_REQUEST_FAILED', { status: 409, details: { message: 'This request changed since it was loaded. Reload and try again.' } }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/This request changed while you were editing it/)).toBeTruthy()
    expect(getRequest).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.getByLabelText('Title').value).toBe('Saved by someone else'))
    expect(screen.getByLabelText('Expected attendees').value).toBe('95')
    expect(updateRequest).toHaveBeenCalledTimes(1)
  })
})

describe('SPM-10 — the "Significant" label in the change history', () => {
  it('is shown on significant entries only', async () => {
    getRequestHistory.mockResolvedValue({
      entries: [
        { id: 'e2', field: 'core.expectedAttendees', oldValue: 80, newValue: 120, significant: true, actor: { type: 'user', name: 'Seed Coordinator 3', role: 'coordinator' }, at: '2026-10-09T10:00:00.000Z' },
        { id: 'e1', field: 'core.title', oldValue: 'A', newValue: 'B', actor: { type: 'user', name: 'Seed Coordinator 3', role: 'coordinator' }, at: '2026-10-08T10:00:00.000Z' },
      ],
    })
    showRequest(response('planning', { canViewChangeHistory: true }))
    const rows = await screen.findAllByRole('listitem', { name: /Event details/ })
    const attendance = rows.find((row) => row.getAttribute('aria-label') === 'Event details · Expected attendees')
    const title = rows.find((row) => row.getAttribute('aria-label') === 'Event details · Title')
    expect(within(attendance).getByText('Significant')).toBeTruthy()
    expect(within(title).queryByText('Significant')).toBeNull()
  })
})
