// SPM-38, presentation side: a released reservation on the Equipment reservations page (SPM-58) shows Released,
// the release time and whether the event was cancelled or rejected. The API is mocked here.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { CANCELLED, REJECTED } from '../../../shared/status.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listEquipmentReservations: vi.fn() }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const released = (overrides) => ({
  id: 'r1', eventRequestId: 'event-a', eventTitle: 'Partner summit', eventStatus: CANCELLED,
  startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z',
  equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, assetTags: ['P-001', 'P-002'],
  status: 'released', reservedAt: '2026-10-18T02:00:00.000Z', reservedByName: 'Seed Technical Staff',
  releasedAt: '2026-10-19T03:00:00.000Z', releasedReason: 'event_cancelled',
  ...overrides,
})

function show() {
  render(
    <AuthContext.Provider value={{ user: { uid: 'seed-technical-staff' }, userProfile: { name: 'Seed' }, roles: [TECHNICAL_STAFF], loading: false }}>
      <MemoryRouter initialEntries={['/equipment/reservations']}><App /></MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('SPM-38 released reservation record', () => {
  it('spm38_page_shows_released_with_the_time_and_whether_the_event_was_cancelled_or_rejected', async () => {
    api.listEquipmentReservations.mockResolvedValue({ reservations: [
      released(),
      released({ id: 'r2', eventRequestId: 'event-b', eventTitle: 'Launch', eventStatus: REJECTED, releasedReason: 'event_rejected' }),
    ] })
    show()

    const cancelled = await screen.findByLabelText('Reservation for Partner summit')
    expect(within(cancelled).getAllByText('Released').length).toBeGreaterThan(0)
    const cancelledRow = within(cancelled).getByText(/Event cancelled/)
    expect(cancelledRow.textContent).toContain(new Date('2026-10-19T03:00:00.000Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))

    const rejected = screen.getByLabelText('Reservation for Launch')
    expect(within(rejected).getByText(/Event rejected/)).toBeTruthy()
  })
})
