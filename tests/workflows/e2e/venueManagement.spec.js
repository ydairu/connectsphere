import {
  DOUBLE_ORIGIN, EXTRA_USERS, FORBIDDEN_HEADING, ROLE_USERS, expect, loginAs, logout, test,
} from '../../shared/e2e/fixtures.js'
import { AVAILABILITY_STATUS, MAINTENANCE_BLOCK_REASONS } from '../../../shared/venueAvailability.js'
import { APPROVE_TECHNICAL, APPROVE_VENUE } from '../../../shared/requestActions.js'
import { CANCEL, CONFIRM } from '../../../shared/statusTransitions.js'

const roomId = 'seed-venue-room'
const roomPath = `/venues/${roomId}`
const roomName = 'Seed Breakout Room (no setup or turnaround)'
const fields = {
  location: 'Level 2, East Wing',
  maximumCapacity: 120,
  facilities: ['Projector', 'Wi-Fi'],
  accessibilityFeatures: ['Step-free access', 'Accessible washroom'],
  supportedLayouts: ['Theatre', 'Classroom', 'Boardroom'],
  operatingHours: 'Monday-Friday 08:00-20:00',
}
const labels = {
  location: 'Physical location',
  maximumCapacity: 'Maximum capacity',
  facilities: 'Facilities',
  accessibilityFeatures: 'Accessibility features',
  supportedLayouts: 'Supported room layouts',
  operatingHours: 'Operating hours',
}
const block = { startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', reason: 'maintenance' }
// Success and loading are separate live regions and may coexist after a write.
const statusMessage = (page, text) => page.getByRole('status').filter({ hasText: text })
async function pauseRead(page, pattern) {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'GET') await gate
    await route.continue()
  })
  return release
}

const headers = (user) => ({ Authorization: `Bearer test-token:${user.uid}` })

async function signIn(page, user = ROLE_USERS.venueStaff) {
  await loginAs(page, user)
  await expect(page).toHaveURL(/\/profile$/)
}
async function snapshot(request) {
  const response = await request.get(`${DOUBLE_ORIGIN}/__double__/venue-state`)
  expect(response.ok()).toBeTruthy()
  return response.json()
}
async function seed(request, data) {
  const response = await request.post(`${DOUBLE_ORIGIN}/__double__/venue-fixtures`, { data })
  expect(response.status()).toBe(204)
}
async function fillDetails(page, values = fields) {
  for (const [key, value] of Object.entries(values)) {
    await page.getByLabel(labels[key], { exact: true }).fill(Array.isArray(value) ? value.join('\n') : String(value))
  }
}
async function expectDetails(page, values = fields) {
  for (const [key, value] of Object.entries(values)) {
    const row = page.locator('.profile-row').filter({ has: page.getByText(labels[key], { exact: true }) })
    for (const text of Array.isArray(value) ? value : [String(value)]) await expect(row).toContainText(text)
    if (Array.isArray(value)) await expect(row.getByRole('listitem')).toHaveText(value)
  }
}
async function calendar(page, from = '2027-03-01T08:00', to = '2027-03-01T18:00') {
  await page.goto(`${roomPath}/availability`)
  await page.getByLabel('To', { exact: true }).fill(to)
  await page.getByLabel('From', { exact: true }).fill(from)
  await expect(page.getByRole('list', { name: 'Availability slots' })).toBeVisible()
}
const slots = (page) => page.getByRole('list', { name: 'Availability slots' }).getByRole('listitem')
async function search(page, from = '2027-03-01T10:00', to = '2027-03-01T12:00') {
  await page.goto('/venues')
  await page.getByLabel('Available from').fill(from)
  await page.getByLabel('Available to').fill(to)
  const response = page.waitForResponse((res) => res.url().includes('/api/venues?') && res.request().method() === 'GET')
  await page.getByRole('button', { name: 'Search available venues' }).click()
  expect((await response).ok()).toBeTruthy()
}

test.describe('SPM-6 / SPM-49 / SPM-29 / SPM-11 / SPM-30 venue management', () => {
  test.use({ timezoneId: 'UTC', locale: 'en-GB' })

  test('SPM-6 SPM-49 create one space, reopen every value and record creator', async ({ page, request }) => {
    const before = await snapshot(request)
    await signIn(page)
    await page.goto('/venues')
    await page.getByRole('main').getByRole('link', { name: 'Add venue', exact: true }).click()
    await page.getByLabel('Venue name').fill('East Wing Conference Room')
    await fillDetails(page)
    const release = await pauseRead(page, '**/api/venues/*')
    try {
      await page.getByRole('button', { name: 'Add venue', exact: true }).click()
      await expect(statusMessage(page, 'Venue added to the catalogue.')).toHaveText('Venue added to the catalogue.')
      await expect(statusMessage(page, 'Loading venue')).toBeVisible()
    } finally { release() }
    await expectDetails(page)
    const savedPath = new URL(page.url()).pathname
    await page.reload()
    await expectDetails(page)
    const after = await snapshot(request)
    expect(Object.keys(after.venues)).toHaveLength(Object.keys(before.venues).length + 1)
    const saved = after.venues[savedPath.split('/').at(-1)]
    expect(saved).toMatchObject({ name: 'East Wing Conference Room', ...fields, createdByUid: ROLE_USERS.venueStaff.uid })
    expect(saved.createdByName).toBe(ROLE_USERS.venueStaff.name)
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false)
    await logout(page)
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/venues')
    await page.locator('.venue-card').filter({ hasText: 'East Wing Conference Room' })
      .getByRole('link', { name: 'View details', exact: true }).click()
    await expectDetails(page)
    await expect(page.getByRole('link', { name: 'Edit venue' })).toHaveCount(0)
    await expect(page.getByText(savedPath.split('/').at(-1), { exact: true })).toHaveCount(0)
    expect((await snapshot(request)).availability).toEqual(before.availability)
  })

  test('SPM-6 missing and invalid fields retain input and create nothing', async ({ page, request }) => {
    const before = await snapshot(request)
    await signIn(page)
    await page.goto('/venues/new')
    await page.getByLabel('Venue name').fill('Retained room name')
    await page.getByLabel('Maximum capacity').fill('-1')
    await page.getByRole('button', { name: 'Add venue', exact: true }).click()
    for (const label of Object.values(labels)) await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Venue name')).toHaveValue('Retained room name')
    await expect(statusMessage(page, 'Fix the highlighted fields')).toContainText('Fix the highlighted fields')
    expect(await snapshot(request)).toEqual(before)
    await fillDetails(page)
    await page.getByRole('button', { name: 'Add venue', exact: true }).click()
    await expect(statusMessage(page, 'Venue added')).toContainText('Venue added')
  })

  test('SPM-29 SPM-49 edit all catalogue fields without duplicating or changing arrangements', async ({ page, request }) => {
    const before = await snapshot(request)
    await signIn(page)
    await page.goto(roomPath)
    await page.getByRole('link', { name: 'Edit venue' }).click()
    const original = before.venues[roomId]
    for (const [key, label] of Object.entries(labels)) {
      const value = original[key]
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(Array.isArray(value) ? value.join('\n') : String(value))
    }
    await fillDetails(page)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(new RegExp(`${roomPath}$`))
    await expect(statusMessage(page, 'Venue details updated.')).toHaveText('Venue details updated.')
    await page.reload()
    await expectDetails(page)
    const after = await snapshot(request)
    expect(Object.keys(after.venues)).toEqual(Object.keys(before.venues))
    expect(after.venues[roomId]).toMatchObject({ name: original.name, ...fields })
    expect(after.availability).toEqual(before.availability)
    const history = Object.values(after.history[roomId])
    expect(history).toHaveLength(6)
    for (const [field, newValue] of Object.entries(fields)) {
      expect(history.find((entry) => entry.field === field)).toMatchObject({
        type: 'venue_field_changed', oldValue: original[field], newValue,
        actor: { uid: ROLE_USERS.venueStaff.uid, name: ROLE_USERS.venueStaff.name, role: 'venue_staff' },
      })
    }
    expect(history.every((entry) => !Number.isNaN(Date.parse(entry.at)))).toBe(true)
    await logout(page)
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto(roomPath)
    await expectDetails(page)
  })

  test('SPM-29 invalid edit and Cancel preserve saved values and history', async ({ page, request }) => {
    const before = await snapshot(request)
    await signIn(page)
    await page.goto(`${roomPath}/edit`)
    await expect(page.getByLabel('Physical location')).toHaveValue(before.venues[roomId].location)
    await fillDetails(page, { ...fields, location: '', maximumCapacity: 0, facilities: [], accessibilityFeatures: [], supportedLayouts: [], operatingHours: '' })
    await page.getByRole('button', { name: 'Save changes' }).click()
    for (const label of Object.values(labels)) await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(await snapshot(request)).toEqual(before)
    await fillDetails(page)
    await page.getByRole('link', { name: 'Cancel', exact: true }).click()
    await expectDetails(page, Object.fromEntries(Object.keys(fields).map((key) => [key, before.venues[roomId][key]])))
    expect(await snapshot(request)).toEqual(before)
  })

  for (const operation of ['create', 'edit']) {
    test(`SPM-${operation === 'create' ? '6' : '29'} failed ${operation} preserves input, no false success or write, retry succeeds`, async ({ page, request }) => {
      const before = await snapshot(request)
      await signIn(page)
      await page.goto(operation === 'create' ? '/venues/new' : `${roomPath}/edit`)
      if (operation === 'create') await page.getByLabel('Venue name').fill('Retry room')
      else await expect(page.getByLabel('Physical location')).toHaveValue(before.venues[roomId].location)
      await fillDetails(page)
      const method = operation === 'create' ? 'POST' : 'PATCH'
      const pattern = operation === 'create' ? '**/api/venues' : `**/api/venues/${roomId}`
      await page.route(pattern, (route) => route.request().method() === method
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Test service outage"}' })
        : route.continue())
      const button = page.getByRole('button', { name: operation === 'create' ? 'Add venue' : 'Save changes', exact: true })
      await button.click()
      await expect(statusMessage(page, operation === 'create' ? 'Could not add' : 'Could not update')).toContainText(operation === 'create' ? 'Could not add' : 'Could not update')
      for (const [key, value] of Object.entries(fields)) await expect(page.getByLabel(labels[key], { exact: true })).toHaveValue(Array.isArray(value) ? value.join('\n') : String(value))
      expect(await snapshot(request)).toEqual(before)
      await page.unroute(pattern)
      await button.click()
      await expect(statusMessage(page, operation === 'create' ? 'Venue added' : 'Venue details updated')).toContainText(operation === 'create' ? 'Venue added' : 'Venue details updated')
      await page.reload()
      await expectDetails(page)
    })
  }

  test('SPM-49 incomplete historical data and empty catalogue are explicit', async ({ page, request }) => {
    await seed(request, { venues: { legacy: { name: 'Historical room' } }, venueAvailability: {} })
    await signIn(page, ROLE_USERS.coordinator)
    await page.goto('/venues')
    await expect(page.locator('.venue-card').getByText('Not recorded', { exact: true })).toHaveCount(6)
    await page.getByRole('link', { name: 'View details', exact: true }).click()
    await expect(page.getByText('Not recorded', { exact: true })).toHaveCount(6)
    await seed(request, { venues: {} })
    await page.goto('/venues')
    await expect(page.getByRole('heading', { name: 'No venues yet' })).toBeVisible()
    expect((await snapshot(request)).availability).toEqual({})
  })

  test('SPM-49 SPM-11 read failures and missing venues show errors, not fabricated data', async ({ page }) => {
    await signIn(page, ROLE_USERS.coordinator)
    await page.route('**/api/venues', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto('/venues')
    await expect(page.getByRole('alert')).toContainText('could not load the venue catalogue')
    await expect(page.getByRole('heading', { name: 'No venues yet' })).toHaveCount(0)
    await page.unroute('**/api/venues')
    await page.goto('/venues/missing-venue')
    await expect(page.getByRole('alert')).toContainText('no longer exists')
    await page.route('**/api/venues/*/availability?*', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto(`${roomPath}/availability`)
    await expect(page.getByRole('alert')).toContainText('could not load venue availability')
    await expect(slots(page)).toHaveCount(0)
  })

  test('SPM-11 distinct calendar states, period navigation, venue selection and zero-buffer boundary', async ({ page, request }) => {
    await seed(request, { venueAvailability: {
      booking: { venueId: roomId, status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, startsAt: '2027-03-01T08:00:00Z', endsAt: '2027-03-01T08:30:00Z' },
      hold: { venueId: roomId, status: AVAILABILITY_STATUS.TENTATIVE_HOLD, startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z' },
      maintenance: { venueId: roomId, status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK, ...block, startsAt: '2027-03-01T12:00:00Z', endsAt: '2027-03-01T13:00:00Z' },
      cancelled: { venueId: roomId, status: AVAILABILITY_STATUS.CONFIRMED_BOOKING, ...block, lifecycleStatus: 'cancelled', title: 'Cancelled booking' },
    } })
    const before = await snapshot(request)
    await signIn(page, ROLE_USERS.coordinator)
    await calendar(page)
    await expect(slots(page).locator('strong')).toHaveText(['Confirmed booking', 'Available', 'Tentative hold', 'Available', 'Maintenance block', 'Available'])
    await expect(slots(page).nth(1)).toContainText('08:30')
    await expect(page.getByText('Cancelled booking', { exact: true })).toHaveCount(0)
    for (const status of ['confirmed-booking', 'tentative-hold', 'maintenance-block', 'available']) {
      await expect(page.getByRole('list', { name: 'Availability slots' }).locator(`.availability-slot-${status}`).first()).toBeVisible()
    }
    await page.getByRole('button', { name: 'Next period' }).click()
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('2027-03-01T18:00')
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('2027-03-02T04:00')
    await expect(slots(page).locator('strong')).toHaveText(['Available'])
    await page.getByRole('button', { name: 'Previous period' }).click()
    await expect(slots(page).locator('strong')).toHaveCount(6)
    await page.getByLabel('Venue', { exact: true }).selectOption('seed-venue-hall')
    await expect(page).toHaveURL(/seed-venue-hall\/availability$/)
    await expect(page.getByRole('heading', { name: 'Seed Hall (setup 30, turnaround 45)' })).toBeVisible()
    expect(await snapshot(request)).toEqual(before)
  })

  test('SPM-30 SPM-11 maintenance create, amend, cancel edit, remove and Coordinator search', async ({ page, request }) => {
    await signIn(page)
    await calendar(page)
    for (const [index, reason] of MAINTENANCE_BLOCK_REASONS.entries()) {
      await expect(page.getByLabel('Reason').locator('option').nth(index)).toHaveAttribute('value', reason)
    }
    await page.getByLabel('Start date').fill('2027-03-01T10:00')
    await page.getByLabel('End date').fill('2027-03-01T12:00')
    await page.getByLabel('Reason').selectOption('safety')
    await page.getByRole('button', { name: 'Create maintenance block' }).click()
    await expect(statusMessage(page, 'Maintenance block created.')).toHaveText('Maintenance block created.')
    await expect(slots(page).filter({ hasText: 'Reason: Safety' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Amend', exact: true }).click()
    await expect(page.getByLabel('Start date')).toHaveValue('2027-03-01T10:00')
    await page.getByLabel('End date').fill('2027-03-01T13:00')
    await page.getByLabel('Reason').selectOption('renovation')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(statusMessage(page, 'Maintenance block updated.')).toHaveText('Maintenance block updated.')
    await expect(slots(page).filter({ hasText: 'Reason: Renovation' })).toContainText('13:00')
    const saved = await snapshot(request)
    await page.getByRole('button', { name: 'Amend', exact: true }).click()
    await page.getByLabel('Reason').selectOption('other')
    await page.getByRole('button', { name: 'Cancel edit' }).click()
    expect(await snapshot(request)).toEqual(saved)
    await logout(page)
    await signIn(page, ROLE_USERS.coordinator)
    await search(page)
    await expect(page.getByRole('heading', { name: roomName })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Seed Hall (setup 30, turnaround 45)' })).toBeVisible()
    await calendar(page)
    await expect(slots(page).filter({ hasText: 'Reason: Renovation' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Amend' })).toHaveCount(0)
    await logout(page)
    await signIn(page)
    await calendar(page)
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(statusMessage(page, 'Maintenance block removed.')).toHaveText('Maintenance block removed.')
    await expect(slots(page).locator('strong')).toHaveText(['Available'])
    await logout(page)
    await signIn(page, ROLE_USERS.coordinator)
    await search(page)
    await expect(page.getByRole('heading', { name: roomName })).toBeVisible()
    expect(Object.values((await snapshot(request)).availability).filter((entry) => entry.venueId === roomId))
      .toMatchObject([{ lifecycleStatus: 'removed', reason: 'renovation' }])
  })

  test('SPM-30 invalid block, failed save and failed removal preserve persisted state', async ({ page, request }) => {
    await signIn(page)
    await calendar(page)
    const before = await snapshot(request)
    await page.getByLabel('Start date').fill('2027-03-01T12:00')
    await page.getByLabel('End date').fill('2027-03-01T10:00')
    await page.getByRole('button', { name: 'Create maintenance block' }).click()
    await expect(page.getByRole('alert')).toContainText('Check the start date')
    expect(await snapshot(request)).toEqual(before)
    await page.getByLabel('Start date').fill('2027-03-01T10:00')
    await page.getByLabel('End date').fill('2027-03-01T12:00')
    const pattern = '**/api/venues/*/maintenance-blocks'
    await page.route(pattern, (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.getByRole('button', { name: 'Create maintenance block' }).click()
    await expect(page.getByRole('alert')).toContainText('could not save')
    await expect(page.getByLabel('Start date')).toHaveValue('2027-03-01T10:00')
    expect(await snapshot(request)).toEqual(before)
    await page.unroute(pattern)
    const release = await pauseRead(page, '**/api/venues/*/availability?*')
    try {
      await page.getByRole('button', { name: 'Create maintenance block' }).click()
      await expect(statusMessage(page, 'Maintenance block created.')).toHaveText('Maintenance block created.')
      await expect(statusMessage(page, 'Loading availability')).toBeVisible()
    } finally { release() }
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible()
    const saved = await snapshot(request)
    await page.route(`${pattern}/*`, (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('could not remove')
    expect(await snapshot(request)).toEqual(saved)
  })

  test('SPM-30 ended block permits a new SPM-11 hold; competing event refused and cancellation frees it', async ({ page, request }) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/venues/${roomId}/maintenance-blocks`, {
      headers: headers(ROLE_USERS.venueStaff), data: { ...block, startsAt: '2020-01-01T10:00:00Z', endsAt: '2020-01-01T12:00:00Z' },
    })
    expect(response.status()).toBe(201)
    for (const [eventId, actor] of [['seed-req-a1-planning', ROLE_USERS.coordinator], ['seed-req-b1-planning', EXTRA_USERS.secondCoordinator]]) {
      const changed = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, {
        headers: headers(actor), data: { core: { preferredDateTime: '2027-03-01T10:00:00.000Z', durationHours: 2 } },
      })
      expect(changed.status()).toBe(200)
    }
    await signIn(page, ROLE_USERS.coordinator)
    await search(page)
    await expect(page.getByRole('heading', { name: roomName })).toBeVisible()
    await page.goto('/requests/seed-req-a1-planning/venue-bookings')
    await page.getByLabel('Venue', { exact: true }).selectOption(roomId)
    await page.getByLabel('Venue requirements', { exact: true }).fill('Theatre')
    await page.getByRole('button', { name: 'Submit booking request', exact: true }).click()
    await expect(statusMessage(page, 'tentatively held')).toContainText('tentatively held')
    await logout(page)
    await signIn(page, EXTRA_USERS.secondCoordinator)
    await page.goto('/requests/seed-req-b1-planning/venue-bookings')
    await expect(page.getByLabel('Venue', { exact: true }).locator(`option[value="${roomId}"]`)).toHaveCount(0)
    const conflict = await request.post(`${DOUBLE_ORIGIN}/api/requests/seed-req-b1-planning/venue-bookings`, {
      headers: headers(EXTRA_USERS.secondCoordinator),
      data: { venueId: roomId, startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', requirements: 'Theatre', submissionKey: 'competing-event' },
    })
    expect(conflict.status()).toBe(409)
    expect(Object.values((await snapshot(request)).availability).filter((entry) => entry.venueId === roomId && entry.status === AVAILABILITY_STATUS.TENTATIVE_HOLD)).toHaveLength(1)
    for (const [user, action] of [
      [ROLE_USERS.venueStaff, APPROVE_VENUE],
      [ROLE_USERS.technicalStaff, APPROVE_TECHNICAL],
      [ROLE_USERS.coordinator, CONFIRM],
    ]) {
      const response = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/seed-req-a1-planning/transitions`, {
        headers: headers(user), data: { action },
      })
      expect(response.ok(), await response.text()).toBeTruthy()
    }
    const cancelled = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/seed-req-a1-planning/transitions`, {
      headers: headers(ROLE_USERS.coordinator), data: { action: CANCEL, reason: 'Event withdrawn' },
    })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    await calendar(page)
    await expect(slots(page).locator('strong')).toHaveText(['Available'])
    await search(page)
    await expect(page.getByRole('heading', { name: roomName })).toBeVisible()
  })

  for (const role of ['coordinator', 'organiser', 'attendee', 'technicalStaff']) {
    test(`SPM-6 SPM-29 SPM-30 ${role} cannot mutate; SPM-49 SPM-11 viewing respects role`, async ({ page, request }) => {
      const user = ROLE_USERS[role]
      const before = await snapshot(request)
      await signIn(page, user)
      for (const path of ['/venues/new', `${roomPath}/edit`]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: FORBIDDEN_HEADING })).toBeVisible()
      }
      for (const path of ['/venues', roomPath, `${roomPath}/availability`]) {
        await page.goto(path)
        if (role !== 'coordinator') {
          await expect(page.getByRole('heading', { name: FORBIDDEN_HEADING })).toBeVisible()
          expect((await request.get(`${DOUBLE_ORIGIN}/api${path}`, { headers: headers(user) })).status()).toBe(403)
        } else {
          const heading = path === '/venues' ? 'Available venues' : path.endsWith('/availability') ? 'Venue availability' : roomName
          await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
          await expect(page.getByRole('heading', { name: FORBIDDEN_HEADING })).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Add venue', exact: true })).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Edit venue' })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Create maintenance block' })).toHaveCount(0)
        }
      }
      for (const [method, path, data] of [
        ['post', '/venues', { name: 'Forbidden room', ...fields }],
        ['patch', roomPath, fields],
        ['post', `${roomPath}/maintenance-blocks`, block],
        ['patch', `${roomPath}/maintenance-blocks/missing`, block],
        ['delete', `${roomPath}/maintenance-blocks/missing`, undefined],
      ]) {
        expect((await request[method](`${DOUBLE_ORIGIN}/api${path}`, { headers: headers(user), data })).status()).toBe(403)
      }
      expect(await snapshot(request)).toEqual(before)
    })
  }
})
