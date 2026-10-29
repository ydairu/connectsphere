import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, test } from '../../shared/e2e/fixtures.js'

const id = 'seed-req-a1-under-review'
const coordinator = ROLE_USERS.coordinator
const auth = (account) => ({ Authorization: `Bearer test-token:${account.uid}` })

test('SPM-71 assigns event staff, routes requests and enforces scoped preparation access', async ({ page, request }) => {
  const moved = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${id}`, {
    headers: auth(coordinator),
    data: { core: { preferredDateTime: '2027-03-10T10:00:00.000Z', durationHours: 2 } },
  })
  expect(moved.status(), await moved.text()).toBe(200)

  await loginAs(page, coordinator)
  await expect(page).toHaveURL(/\/profile$/)
  await page.goto(`/requests/${id}`)
  await page.getByRole('button', { name: 'Approve for planning' }).click()
  await expect(page.locator('.page-heading .status-pill')).toHaveText('Planning')
  await expect(page.getByRole('heading', { name: 'Assigned event staff' })).toBeVisible()
  await expect(page.getByText('Venue Staff: Seed Venue Staff')).toBeVisible()
  await expect(page.getByText('Technical Support Staff: Seed Technical Staff')).toBeVisible()

  const bookingResponse = await request.post(`${DOUBLE_ORIGIN}/api/requests/${id}/venue-bookings`, {
    headers: auth(coordinator),
    data: { venueId: 'seed-venue-room', startsAt: '2027-03-10T10:00:00.000Z', endsAt: '2027-03-10T12:00:00.000Z',
      attendeeCount: 30, requirements: 'Classroom', specialRequests: '', submissionKey: 'spm71-booking' },
  })
  expect(bookingResponse.status(), await bookingResponse.text()).toBe(201)
  expect((await bookingResponse.json()).booking.assignedVenueStaffName).toBe('Seed Venue Staff')
  const typeResponse = await request.post(`${DOUBLE_ORIGIN}/api/equipment`, {
    headers: auth(ROLE_USERS.technicalStaff), data: { name: 'SPM-71 projector' },
  })
  expect(typeResponse.status(), await typeResponse.text()).toBe(201)
  const typeId = (await typeResponse.json()).equipment.id
  const equipmentResponse = await request.post(`${DOUBLE_ORIGIN}/api/requests/${id}/equipment-requests`, {
    headers: auth(coordinator),
    data: { items: [{ equipmentTypeId: typeId, quantity: 1 }], submissionKey: 'spm71-equipment' },
  })
  expect(equipmentResponse.status(), await equipmentResponse.text()).toBe(201)
  expect((await equipmentResponse.json()).equipmentRequest.assignedTechnicalStaffName).toBe('Seed Technical Staff')
  await logout(page)

  for (const account of [ROLE_USERS.venueStaff, ROLE_USERS.technicalStaff]) {
    await loginAs(page, account)
    await expect(page).toHaveURL(/\/profile$/)
    await page.goto('/requests')
    await expect(page.getByRole('heading', { name: 'A1 under review' })).toBeVisible()
    const list = await request.get(`${DOUBLE_ORIGIN}/api/requests`, { headers: auth(account) })
    expect((await list.json()).requests.some((event) => event.id === id)).toBe(true)
    await page.goto('/notifications')
    await expect(page.getByText(/You have been assigned to/)).toBeVisible()
    await page.goto(`/requests/${id}`)
    await expect(page.locator('.page-heading .status-pill')).toHaveText('Planning')
    await logout(page)
  }

  const unassigned = await request.get(`${DOUBLE_ORIGIN}/api/requests/${id}`, { headers: auth(EXTRA_USERS.venueTechnicalStaff) })
  expect(unassigned.status()).toBe(403)
  const forged = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${id}`, {
    headers: auth(ROLE_USERS.venueStaff), data: { equipmentPreparation: { notes: 'forged' } },
  })
  expect(forged.status()).toBe(403)
  const organiser = await request.get(`${DOUBLE_ORIGIN}/api/requests/${id}`, { headers: auth(ROLE_USERS.organiser) })
  expect((await organiser.json()).assignedEventStaff).toBeNull()
})
