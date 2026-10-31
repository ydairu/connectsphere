// SPM-48 equipment preparation page after SPM-89 moves venue preparation to each booking.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), getVenueBookings: vi.fn(), getRequestHistory: vi.fn() }
})
const { getRequest, updateRequest, getVenueBookings, getRequestHistory } = await import('../../../frontend/src/services/api.js')
afterEach(() => { cleanup(); vi.clearAllMocks() })
const core = { title: 'Summit', expectedAttendees: 80 }
function show(body, roles, tab = 'equipment-required') {
  getRequest.mockResolvedValue({ availableActions: [], canViewChangeHistory: false, ...body })
  getVenueBookings.mockResolvedValue({ bookings: [] })
  getRequestHistory.mockResolvedValue({ entries: [] })
  render(<AuthContext.Provider value={{ user: { uid: 'u1' }, userProfile: { name: 'User' }, roles, loading: false }}>
    <MemoryRouter initialEntries={[`/requests/req-1?tab=${tab}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>
  </AuthContext.Provider>)
  return userEvent.setup()
}

describe('SPM-48 page after per-venue preparation', () => {
  it('Technical Support Staff edit equipment status and notes only', async () => {
    const response = { request: { id: 'req-1', status: 'preparation', core, equipment: { requirements: [] },
      equipmentPreparation: { status: 'not_started', notes: '' } }, editableSections: ['equipmentPreparation'],
      preparation: { equipmentPreparation: { editable: true, readOnlyReason: null } } }
    const user = show(response, ['technical_staff'])
    await user.selectOptions(await screen.findByLabelText('Equipment preparation status'), 'ready')
    await user.type(screen.getByLabelText('Equipment preparation notes'), 'Tested')
    updateRequest.mockResolvedValue(response)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateRequest.mock.calls[0][2]).toEqual({ equipmentPreparation: { status: 'ready', notes: 'Tested' } })
    expect(screen.queryByRole('heading', { name: 'Venue preparation' })).toBeNull()
  })
  it('equipment is read-only before Preparation', async () => {
    show({ request: { id: 'req-1', status: 'planning', core, equipmentPreparation: { status: 'not_started', notes: '' } },
      editableSections: [], preparation: { equipmentPreparation: { editable: false, readOnlyReason: 'preparation_not_started_yet' } } }, ['technical_staff'])
    const heading = await screen.findByRole('heading', { name: 'Equipment preparation' })
    expect(within(heading.closest('.request-form-section')).getByText('Available once the event is in Preparation.')).toBeTruthy()
    expect(screen.queryByLabelText('Equipment preparation status')).toBeNull()
  })
  it('the Coordinator sees aggregate venue and equipment readiness, with no legacy venue card', async () => {
    show({ request: { id: 'req-1', status: 'preparation', core, venue: {}, equipmentPreparation: { status: 'ready', notes: 'Tested' } },
      editableSections: [], eventPreparationReadiness: { ready: false, equipmentReady: true,
        venues: [{ bookingId: 'hall', venueName: 'Hall', status: 'in_progress' }, { bookingId: 'room', venueName: 'Room', status: 'ready' }] } },
    ['coordinator'], 'venue-details')
    const heading = await screen.findByRole('heading', { name: 'Event preparation readiness' })
    const card = heading.closest('.request-form-section')
    expect(within(card).getByText('Hall: In Progress')).toBeTruthy()
    expect(within(card).getByText('Room: Ready')).toBeTruthy()
    expect(within(card).getByRole('status').textContent).toBe('Not ready')
    expect(screen.queryByRole('heading', { name: 'Venue preparation' })).toBeNull()
  })
  it('Organisers see neither preparation card nor readiness', async () => {
    show({ request: { id: 'req-1', status: 'confirmed', core, venue: {}, registration: { enabled: true } },
      editableSections: [], eventPreparationReadiness: null }, ['organiser'], 'venue-details')
    await screen.findByRole('heading', { name: 'Venue', exact: true })
    expect(screen.queryByRole('heading', { name: 'Event preparation readiness' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Venue preparation' })).toBeNull()
  })
})
