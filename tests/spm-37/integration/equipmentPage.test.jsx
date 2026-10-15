// SPM-37 — the equipment pages with a mocked API: available counts, status changes and role-based controls.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { EQUIPMENT_UNIT_STATUS } from '../../../shared/equipment.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF } from '../../../shared/permissions.js'
import App from '../../../frontend/src/App.jsx'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'

vi.mock('../../../frontend/src/services/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    addEquipmentUnit: vi.fn(),
    createEquipmentType: vi.fn(),
    getEquipmentType: vi.fn(),
    listEquipment: vi.fn(),
    updateEquipmentUnitStatus: vi.fn(),
  }
})

const { addEquipmentUnit, createEquipmentType, getEquipmentType, listEquipment, updateEquipmentUnitStatus } = await import(
  '../../../frontend/src/services/api.js'
)

const { AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE } = EQUIPMENT_UNIT_STATUS

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const microphones = {
  id: 'microphones',
  name: 'Wireless microphone',
  location: 'Store B2',
  totalUnits: 10,
  availableUnits: 8,
  unavailableUnits: 2,
  byStatus: { [AVAILABLE]: 8, [DAMAGED]: 1, [UNDER_REPAIR]: 1, [UNAVAILABLE]: 0 },
}

function microphoneDetail(statuses) {
  const units = statuses.map((status, index) => ({ id: `mic-${index + 1}`, assetTag: `MIC-00${index + 1}`, status, statusNote: null }))
  const available = statuses.filter((status) => status === AVAILABLE).length
  return { ...microphones, totalUnits: units.length, availableUnits: available, unavailableUnits: units.length - available, units }
}

function showPage(path, roles) {
  render(
    <AuthContext.Provider
      value={{
        user: { uid: 'user-1', getIdToken: vi.fn().mockResolvedValue('token') },
        userProfile: { name: 'User One' },
        roles,
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return userEvent.setup()
}

describe('SPM-37 — equipment availability page', () => {
  it('spm37_page_shows_eight_of_ten_available_and_what_is_not_available', async () => {
    listEquipment.mockResolvedValue({ period: null, equipment: [microphones] })
    showPage('/equipment', [TECHNICAL_STAFF])

    const card = (await screen.findByRole('heading', { name: 'Wireless microphone' })).closest('li')
    expect(within(card).getByText('8 of 10')).toBeTruthy()
    expect(within(card).getByText('1 damaged, 1 under repair, 0 unavailable')).toBeTruthy()
  })

  it('spm37_page_checks_availability_for_an_event_period', async () => {
    listEquipment.mockResolvedValue({ period: null, equipment: [microphones] })
    const user = showPage('/equipment', [COORDINATOR])
    await screen.findByRole('heading', { name: 'Wireless microphone' })

    listEquipment.mockResolvedValue({
      period: { from: new Date('2026-11-20T09:00').toISOString(), to: new Date('2026-11-20T17:00').toISOString() },
      equipment: [microphones],
    })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-20T09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-20T17:00' } })
    await user.click(screen.getByRole('button', { name: 'Check availability' }))

    await waitFor(() =>
      expect(listEquipment).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'user-1' }), {
        from: new Date('2026-11-20T09:00').toISOString(),
        to: new Date('2026-11-20T17:00').toISOString(),
      }),
    )
    expect(await screen.findByText(/Showing availability from/)).toBeTruthy()
  })

  it('spm37_page_refuses_a_period_that_ends_before_it_starts', async () => {
    listEquipment.mockResolvedValue({ period: null, equipment: [microphones] })
    const user = showPage('/equipment', [COORDINATOR])
    await screen.findByRole('heading', { name: 'Wireless microphone' })

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-20T17:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-20T09:00' } })
    await user.click(screen.getByRole('button', { name: 'Check availability' }))

    expect(screen.getByText('The end must be after the start.')).toBeTruthy()
    expect(listEquipment).toHaveBeenCalledTimes(1)
  })

  it('spm37_page_technical_staff_add_an_equipment_type', async () => {
    listEquipment.mockResolvedValue({ period: null, equipment: [] })
    createEquipmentType.mockResolvedValue({ equipment: { id: 'laptops', name: 'Laptop' } })
    const user = showPage('/equipment', [TECHNICAL_STAFF])

    await user.type(await screen.findByLabelText('Equipment type'), 'Laptop')
    await user.click(screen.getByRole('button', { name: 'Add equipment type' }))

    await waitFor(() => expect(createEquipmentType).toHaveBeenCalledWith(expect.anything(), { name: 'Laptop', location: '' }))
    expect(await screen.findByText('Laptop added. Open it to add its units.')).toBeTruthy()
  })

  it('spm37_page_coordinators_see_availability_without_management_controls', async () => {
    listEquipment.mockResolvedValue({ period: null, equipment: [microphones] })
    showPage('/equipment', [COORDINATOR])

    await screen.findByRole('heading', { name: 'Wireless microphone' })
    expect(screen.queryByRole('heading', { name: 'Add an equipment type' })).toBeNull()
  })

  it('spm37_page_is_forbidden_to_organisers', async () => {
    showPage('/equipment', [ORGANISER])

    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeTruthy()
    expect(listEquipment).not.toHaveBeenCalled()
  })
})

describe('SPM-37 — equipment units page', () => {
  it('spm37_page_technical_staff_mark_a_unit_damaged_and_the_count_updates', async () => {
    getEquipmentType.mockResolvedValueOnce({ equipment: microphoneDetail([AVAILABLE, AVAILABLE]) })
    getEquipmentType.mockResolvedValueOnce({ equipment: microphoneDetail([DAMAGED, AVAILABLE]) })
    updateEquipmentUnitStatus.mockResolvedValue({ unit: { id: 'mic-1', status: DAMAGED } })
    const user = showPage('/equipment/microphones', [TECHNICAL_STAFF])

    expect(await screen.findByText('2 of 2 units available.', { exact: false })).toBeTruthy()
    const form = screen.getByRole('form', { name: 'Status of MIC-001' })
    await user.selectOptions(within(form).getByLabelText('Status'), DAMAGED)
    await user.type(within(form).getByLabelText('Note (optional)'), 'Cracked casing')
    await user.click(within(form).getByRole('button', { name: 'Save status' }))

    await waitFor(() =>
      expect(updateEquipmentUnitStatus).toHaveBeenCalledWith(expect.anything(), 'microphones', 'mic-1', {
        status: DAMAGED,
        note: 'Cracked casing',
      }),
    )
    expect(await screen.findByText('MIC-001 is now Damaged.')).toBeTruthy()
    expect(screen.getByText('1 of 2 units available.', { exact: false })).toBeTruthy()
  })

  it('spm37_page_shows_a_save_error_without_changing_the_unit', async () => {
    getEquipmentType.mockResolvedValue({ equipment: microphoneDetail([AVAILABLE]) })
    updateEquipmentUnitStatus.mockRejectedValue(Object.assign(new Error('fail'), { status: 500 }))
    const user = showPage('/equipment/microphones', [TECHNICAL_STAFF])

    const form = await screen.findByRole('form', { name: 'Status of MIC-001' })
    await user.selectOptions(within(form).getByLabelText('Status'), UNAVAILABLE)
    await user.click(within(form).getByRole('button', { name: 'Save status' }))

    expect(await within(form).findByRole('alert')).toBeTruthy()
    expect(getEquipmentType).toHaveBeenCalledTimes(1)
  })

  it('spm37_page_technical_staff_add_a_unit', async () => {
    getEquipmentType.mockResolvedValue({ equipment: microphoneDetail([]) })
    addEquipmentUnit.mockResolvedValue({ unit: { id: 'mic-11', assetTag: 'MIC-011', status: AVAILABLE } })
    const user = showPage('/equipment/microphones', [TECHNICAL_STAFF])

    await user.type(await screen.findByLabelText('Asset tag'), 'MIC-011')
    await user.click(screen.getByRole('button', { name: 'Add unit' }))

    await waitFor(() => expect(addEquipmentUnit).toHaveBeenCalledWith(expect.anything(), 'microphones', { assetTag: 'MIC-011' }))
    expect(await screen.findByText('Unit MIC-011 added as Available.')).toBeTruthy()
  })

  it('spm37_page_shows_a_duplicate_asset_tag_error', async () => {
    getEquipmentType.mockResolvedValue({ equipment: microphoneDetail([AVAILABLE]) })
    addEquipmentUnit.mockRejectedValue(
      Object.assign(new Error('dup'), { status: 409, details: { errors: { assetTag: 'This asset tag is already used by this equipment type.' } } }),
    )
    const user = showPage('/equipment/microphones', [TECHNICAL_STAFF])

    await user.type(await screen.findByLabelText('Asset tag'), 'MIC-001')
    await user.click(screen.getByRole('button', { name: 'Add unit' }))

    expect(await screen.findByText('This asset tag is already used by this equipment type.')).toBeTruthy()
  })

  it('spm37_page_coordinators_see_unit_statuses_read_only', async () => {
    getEquipmentType.mockResolvedValue({ equipment: microphoneDetail([AVAILABLE, UNDER_REPAIR]) })
    showPage('/equipment/microphones', [COORDINATOR])

    expect(await screen.findByText('Under Repair')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save status' })).toBeNull()
    expect(screen.queryByLabelText('Asset tag')).toBeNull()
  })

  it('spm37_page_reports_a_missing_equipment_type', async () => {
    getEquipmentType.mockRejectedValue(Object.assign(new Error('missing'), { status: 404 }))
    showPage('/equipment/missing', [TECHNICAL_STAFF])

    expect(await screen.findByText('This equipment type no longer exists.')).toBeTruthy()
  })
})
