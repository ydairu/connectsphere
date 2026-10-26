// SPM-48, presentation side: the request page shows the preparation cards the API sends, editable only when
// editableSections lists them and otherwise with the API's read-only reason; the Coordinator's view is
// read-only; an Organiser sees nothing new; status values are shown by label, in the cards and in the change
// history. The API is mocked; the rules are covered by preparationApi.test.js.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RequestDetailPage from '../../../frontend/src/pages/RequestDetailPage.jsx'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRequest: vi.fn(), updateRequest: vi.fn(), transitionRequest: vi.fn(), getRequestHistory: vi.fn() }
})

const { getRequest, getRequestHistory, updateRequest } = await import('../../../frontend/src/services/api.js')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CORE = { title: 'Partner summit', purpose: 'Partners', expectedAttendees: 80 }
const VENUE = { layoutPreference: 'theatre', accessibilityRequired: true }
const EQUIPMENT = { requirements: ['projector'], technicalSupportNeeded: true }

function showRequest(body, roles, tab = roles.includes('technical_staff') ? 'equipment-required' : 'venue-details') {
  getRequest.mockResolvedValue({ availableActions: [], canViewChangeHistory: false, ...body })
  render(
    <AuthContext.Provider value={{ user: { uid: 'u-1' }, userProfile: { name: 'User' }, roles, loading: false }}>
      <MemoryRouter initialEntries={[`/requests/req-1?tab=${tab}`]}>
        <Routes>
          <Route path="/requests/:id" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

const card = (title) => screen.getByRole('heading', { name: title }).closest('.request-form-section')

describe('SPM-48 — Venue Staff', () => {
  const venueStaff = (overrides = {}) => ({
    request: { id: 'req-1', status: 'preparation', core: CORE, venue: VENUE, venuePreparation: { status: 'in_progress', notes: 'Chairs ordered' } },
    editableSections: ['venuePreparation'],
    preparation: { venuePreparation: { editable: true, readOnlyReason: null } },
    ...overrides,
  })

  it('see an editable Venue preparation card and no Equipment preparation card; the requested venue is read-only', async () => {
    showRequest(venueStaff(), ['venue_staff'])
    expect(await screen.findByRole('heading', { name: 'Venue preparation' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Equipment preparation' })).toBeNull()

    const status = within(card('Venue preparation')).getByLabelText('Venue preparation status')
    expect(status.value).toBe('in_progress')
    expect([...status.options].map((option) => option.textContent)).toEqual(['Not Started', 'In Progress', 'Ready'])
    expect(within(card('Venue preparation')).getByLabelText('Venue preparation notes').value).toBe('Chairs ordered')

    expect(within(card('Venue')).getByText('Read only')).toBeTruthy()
    expect(screen.queryByLabelText('Layout preference')).toBeNull()
  })

  it('save only the changed field, and an emptied note is saved as empty text', async () => {
    const user = showRequest(venueStaff(), ['venue_staff'])
    await user.selectOptions(await screen.findByLabelText('Venue preparation status'), 'ready')
    await user.clear(screen.getByLabelText('Venue preparation notes'))

    updateRequest.mockResolvedValueOnce(venueStaff({ request: { ...venueStaff().request, venuePreparation: { status: 'ready', notes: '' } } }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateRequest).toHaveBeenCalled())
    expect(updateRequest.mock.calls[0][2]).toEqual({ venuePreparation: { status: 'ready', notes: '' } })
    expect(await screen.findByText('Changes saved.')).toBeTruthy()
  })

  it('before Preparation: read-only, with the reason, and nothing to save', async () => {
    showRequest(
      venueStaff({
        request: { id: 'req-1', status: 'planning', core: CORE, venue: VENUE, venuePreparation: { status: 'not_started', notes: '' } },
        editableSections: [],
        preparation: { venuePreparation: { editable: false, readOnlyReason: 'preparation_not_started_yet' } },
      }),
      ['venue_staff'],
    )
    await screen.findByRole('heading', { name: 'Venue preparation' })
    const venuePreparation = card('Venue preparation')
    expect(within(venuePreparation).getByText('Read only')).toBeTruthy()
    expect(within(venuePreparation).getByText('Available once the event is in Preparation.')).toBeTruthy()
    expect(within(venuePreparation).getByText('Not Started')).toBeTruthy()
    expect(screen.queryByLabelText('Venue preparation status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('on a closed event: read-only, with the reason', async () => {
    showRequest(
      venueStaff({
        request: { id: 'req-1', status: 'completed', core: CORE, venue: VENUE, venuePreparation: { status: 'ready', notes: 'Done' } },
        editableSections: [],
        preparation: { venuePreparation: { editable: false, readOnlyReason: 'event_closed' } },
      }),
      ['venue_staff'],
    )
    expect(await screen.findByText('This event is closed.')).toBeTruthy()
    expect(within(card('Venue preparation')).getByText('Ready')).toBeTruthy()
    expect(within(card('Venue preparation')).getByText('Done')).toBeTruthy()
  })
})

describe('SPM-48 — Technical Support Staff', () => {
  it('see an editable Equipment preparation card and no Venue preparation card', async () => {
    showRequest(
      {
        request: { id: 'req-1', status: 'preparation', core: CORE, equipment: EQUIPMENT, equipmentPreparation: { status: 'not_started', notes: '' } },
        editableSections: ['equipmentPreparation'],
        preparation: { equipmentPreparation: { editable: true, readOnlyReason: null } },
      },
      ['technical_staff'],
    )
    expect(await screen.findByLabelText('Equipment preparation status')).toBeTruthy()
    expect(screen.getByLabelText('Equipment preparation notes')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Venue preparation' })).toBeNull()
    expect(screen.queryByLabelText('Equipment required (one per line)')).toBeNull()
  })

  it('before Preparation: read-only, with the reason', async () => {
    showRequest(
      {
        request: { id: 'req-1', status: 'planning', core: CORE, equipment: EQUIPMENT, equipmentPreparation: { status: 'not_started', notes: '' } },
        editableSections: [],
        preparation: { equipmentPreparation: { editable: false, readOnlyReason: 'preparation_not_started_yet' } },
      },
      ['technical_staff'],
    )
    expect(await screen.findByText('Available once the event is in Preparation.')).toBeTruthy()
    expect(screen.queryByLabelText('Equipment preparation status')).toBeNull()
  })
})

describe('SPM-48 — the assigned Coordinator', () => {
  it('sees both preparation statuses and notes, read-only, with no staff reason', async () => {
    const user = showRequest(
      {
        request: {
          id: 'req-1',
          status: 'confirmed',
          core: CORE,
          venue: VENUE,
          equipment: EQUIPMENT,
          internal: { planningNotes: 'Hold Hall B' },
          venuePreparation: { status: 'in_progress', notes: 'Chairs ordered' },
          equipmentPreparation: { status: 'ready', notes: 'Projector tested' },
        },
        editableSections: ['core', 'venue', 'equipment', 'internal'],
        preparation: null,
      },
      ['coordinator'],
    )
    await screen.findByRole('heading', { name: 'Venue preparation' })
    const venuePreparation = card('Venue preparation')
    expect(within(venuePreparation).getByText('Read only')).toBeTruthy()
    expect(within(venuePreparation).getByText('In Progress')).toBeTruthy()
    expect(within(venuePreparation).getByText('Chairs ordered')).toBeTruthy()
    expect(screen.queryByLabelText('Venue preparation status')).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Equipment Required' }))
    const equipmentPreparation = card('Equipment preparation')
    expect(within(equipmentPreparation).getByText('Read only')).toBeTruthy()
    expect(within(equipmentPreparation).getByText('Ready')).toBeTruthy()
    expect(within(equipmentPreparation).getByText('Projector tested')).toBeTruthy()
    expect(screen.queryByLabelText('Equipment preparation notes')).toBeNull()
    expect(screen.queryByText(/sign-off is approved/)).toBeNull()
  })
})

describe('SPM-48 — Organisers', () => {
  it('see no preparation card (the API sends none)', async () => {
    showRequest(
      {
        request: { id: 'req-1', status: 'confirmed', core: CORE, venue: VENUE, equipment: EQUIPMENT, registration: { enabled: true } },
        editableSections: [],
        isOwnRequest: true,
        ownerName: 'Owner',
      },
      ['organiser'],
    )
    expect(await screen.findByRole('heading', { name: 'Venue', exact: true })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Venue preparation' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Equipment preparation' })).toBeNull()
    expect(screen.queryByText(/preparation/i)).toBeNull()
  })
})

describe('SPM-48 — preparation in the change history panel', () => {
  it('readable labels, and status values by label', async () => {
    getRequestHistory.mockResolvedValue({
      entries: [
        { id: 'e2', field: 'equipmentPreparation.notes', oldValue: '', newValue: 'Projector tested', actor: { type: 'user', name: 'Seed Technical Staff', role: 'technical_staff' }, at: '2026-10-07T10:00:00.000Z' },
        { id: 'e1', field: 'venuePreparation.status', oldValue: 'not_started', newValue: 'in_progress', actor: { type: 'user', name: 'Seed Venue Staff', role: 'venue_staff' }, at: '2026-10-06T10:00:00.000Z' },
      ],
    })
    showRequest(
      {
        request: { id: 'req-1', status: 'confirmed', core: CORE, venuePreparation: { status: 'in_progress', notes: '' }, equipmentPreparation: { status: 'not_started', notes: 'Projector tested' } },
        editableSections: [],
        canViewChangeHistory: true,
      },
      ['coordinator'],
      'change-log',
    )
    const history = (await screen.findByRole('heading', { name: 'Change history' })).closest('.request-form-section')
    expect(await within(history).findByText('Venue preparation · Status')).toBeTruthy()
    expect(within(history).getByText('Equipment preparation · Notes')).toBeTruthy()
    expect(within(history).getByText('Not Started')).toBeTruthy()
    expect(within(history).getByText('In Progress')).toBeTruthy()
  })
})
