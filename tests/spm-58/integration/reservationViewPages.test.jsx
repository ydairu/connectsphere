// SPM-58, presentation side: the Equipment reservations page (reached from the Equipment page, not the
// navbar), which event each unit is reserved for, and the event's reserved equipment on its Equipment Required
// tab. The API is mocked here; rules and enforcement are covered by the API tests.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { COORDINATOR, ORGANISER, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRequest: vi.fn(),
    getRequestHistory: vi.fn(),
    getEquipmentType: vi.fn(),
    listEquipment: vi.fn(),
    listEquipmentRequests: vi.fn(),
    listEquipmentReservations: vi.fn(),
  }
})

const api = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const user = { uid: 'seed-technical-staff' }

function show(path, roles) {
  render(
    <AuthContext.Provider value={{ user, userProfile: { name: 'Seed' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const active = {
  id: 'r1', eventRequestId: 'event-a', eventTitle: 'Partner summit', eventStatus: PLANNING,
  startsAt: '2026-11-20T01:00:00.000Z', endsAt: '2026-11-20T05:00:00.000Z',
  equipmentTypeId: 'projector', equipmentTypeName: 'Projector', quantity: 2, assetTags: ['P-001', 'P-002'],
  status: 'active', reservedAt: '2026-10-18T02:00:00.000Z', reservedByName: 'Seed Technical Staff', releasedAt: null, releasedReason: null,
}
const released = { ...active, id: 'r2', eventRequestId: 'event-b', eventTitle: 'Launch', status: 'released', releasedAt: '2026-10-19T03:00:00.000Z', releasedReason: 'event_cancelled' }

describe('SPM-58 Equipment reservations page', () => {
  it('spm58_page_each_reservation_shows_event_date_time_type_quantity_and_status', async () => {
    api.listEquipmentReservations.mockResolvedValue({ reservations: [active, released] })
    show('/equipment/reservations', [TECHNICAL_STAFF])

    const first = await screen.findByLabelText('Reservation for Partner summit')
    expect(within(first).getByText('Active')).toBeTruthy()
    expect(within(first).getByText('2 × Projector')).toBeTruthy()
    expect(within(first).getByText('P-001, P-002')).toBeTruthy()
    expect(within(first).getByText(/Seed Technical Staff/)).toBeTruthy()
    expect(within(first).getByRole('link', { name: 'Open event' }).getAttribute('href')).toBe('/requests/event-a?tab=equipment-required')
    expect(within(first).queryByText('Released')).toBeNull()

    const second = screen.getByLabelText('Reservation for Launch')
    expect(within(second).getAllByText('Released')).toHaveLength(2)
  })

  it('spm58_page_filters_by_status', async () => {
    api.listEquipmentReservations.mockResolvedValue({ reservations: [active] })
    const actor = show('/equipment/reservations', [TECHNICAL_STAFF])
    await screen.findByLabelText('Reservation for Partner summit')

    api.listEquipmentReservations.mockResolvedValue({ reservations: [] })
    await actor.selectOptions(screen.getByLabelText('Show'), 'released')

    await waitFor(() => expect(api.listEquipmentReservations).toHaveBeenLastCalledWith(user, { status: 'released' }))
    expect(await screen.findByText(/No equipment is reserved for the events assigned to you with this status/)).toBeTruthy()
  })

  it('spm58_page_is_reached_from_the_equipment_page_not_the_navbar', async () => {
    api.listEquipment.mockResolvedValue({ period: null, equipment: [] })
    show('/equipment', [TECHNICAL_STAFF])

    expect((await screen.findByRole('link', { name: 'View reservations' })).getAttribute('href')).toBe('/equipment/reservations')
    const navbar = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navbar).queryByRole('link', { name: /reservation/i })).toBeNull()
  })

  it('spm58_page_coordinators_get_no_reservations_link_or_page', async () => {
    api.listEquipment.mockResolvedValue({ period: null, equipment: [] })
    show('/equipment', [COORDINATOR])
    await screen.findByRole('heading', { name: 'Equipment availability' })
    expect(screen.queryByRole('link', { name: 'View reservations' })).toBeNull()

    cleanup()
    show('/equipment/reservations', [COORDINATOR])
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeTruthy()
    expect(api.listEquipmentReservations).not.toHaveBeenCalled()
  })
})

describe('SPM-58 which event a unit is reserved for', () => {
  it('spm58_page_each_unit_lists_its_reservations_and_hides_events_the_viewer_may_not_see', async () => {
    api.getEquipmentType.mockResolvedValue({
      equipment: {
        id: 'projector', name: 'Projector', location: null, totalUnits: 3, availableUnits: 3, unavailableUnits: 0,
        units: [
          { id: 'u1', assetTag: 'P-001', status: 'available', statusNote: null, reservations: [{ eventRequestId: 'event-a', eventTitle: 'Partner summit', startsAt: active.startsAt, endsAt: active.endsAt, reservedAt: active.reservedAt }] },
          { id: 'u2', assetTag: 'P-002', status: 'available', statusNote: null, reservations: [{ eventRequestId: null, eventTitle: null, startsAt: active.startsAt, endsAt: active.endsAt, reservedAt: active.reservedAt }] },
          { id: 'u3', assetTag: 'P-003', status: 'available', statusNote: null, reservations: [] },
        ],
      },
    })
    show('/equipment/projector', [TECHNICAL_STAFF])

    const first = (await screen.findByRole('heading', { name: 'P-001' })).closest('li')
    expect(within(first).getByRole('link', { name: 'Partner summit' }).getAttribute('href')).toBe('/requests/event-a?tab=equipment-required')
    const second = screen.getByRole('heading', { name: 'P-002' }).closest('li')
    expect(within(second).getByText(/Reserved for another event/)).toBeTruthy()
    expect(within(second).queryByRole('link', { name: /summit/ })).toBeNull()
    expect(within(screen.getByRole('heading', { name: 'P-003' }).closest('li')).getByText('Not reserved')).toBeTruthy()
  })
})

describe('SPM-58 reserved equipment on the event', () => {
  it('spm58_page_the_equipment_required_tab_lists_reserved_items_and_quantities', async () => {
    api.listEquipmentRequests.mockRejectedValue(Object.assign(new Error('hidden'), { status: 404 }))
    api.getRequest.mockResolvedValue({
      request: { id: 'event-a', status: PLANNING, core: { title: 'Partner summit' }, equipment: { requirements: ['projector'], technicalSupportNeeded: false } },
      editableSections: [], availableActions: [],
      reservedEquipment: { items: [{ equipmentTypeName: 'Projector', quantity: 2 }], reservedAt: active.reservedAt },
    })
    show('/requests/event-a?tab=equipment-required', [ORGANISER])

    const card = await screen.findByLabelText('Reserved equipment')
    expect(within(card).getByText('2 × Projector')).toBeTruthy()
    expect(card.textContent).not.toMatch(/P-00\d/)
  })

  it('spm58_page_nothing_reserved_shows_no_reserved_equipment_card', async () => {
    api.listEquipmentRequests.mockRejectedValue(Object.assign(new Error('hidden'), { status: 404 }))
    api.getRequest.mockResolvedValue({
      request: { id: 'event-a', status: PLANNING, core: { title: 'Partner summit' }, equipment: { requirements: ['projector'], technicalSupportNeeded: false } },
      editableSections: [], availableActions: [], reservedEquipment: null,
    })
    show('/requests/event-a?tab=equipment-required', [ORGANISER])

    await screen.findByRole('tab', { name: 'Equipment Required' })
    expect(screen.queryByLabelText('Reserved equipment')).toBeNull()
  })
})
