import { DOUBLE_ORIGIN, EXTRA_USERS, ROLE_USERS, expect, loginAs, logout, recordSafetyApproval, test } from '../../shared/e2e/fixtures.js'

const eventId = 'seed-req-a1-planning'
const coordinator = ROLE_USERS.coordinator
const headers = (uid) => ({ Authorization: `Bearer test-token:${uid}` })
test.use({ timezoneId: 'UTC', locale: 'en-GB' })

async function signIn(page, account) {
  await loginAs(page, account)
  await expect(page).toHaveURL(/\/profile$/)
}

test('two booked venues have independent preparation, aggregate readiness and named history', async ({ page, request }) => {
  test.setTimeout(60_000)
  const patch = await request.patch(`${DOUBLE_ORIGIN}/api/requests/${eventId}`, { headers: headers(coordinator.uid), data: {
    core: { preferredDateTime: '2027-03-01T10:00:00Z', durationHours: 2, expectedAttendees: 100 },
    equipment: { requirements: [], technicalSupportNeeded: false },
  } })
  expect(patch.status(), await patch.text()).toBe(200)
  const submit = async (venueId, count, key) => {
    const response = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings`, {
      headers: headers(coordinator.uid), data: { venueId, startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T12:00:00Z',
        attendeeCount: count, requirements: 'Theatre layout', submissionKey: key },
    })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()).booking
  }
  const hall = await submit('seed-venue-hall', 80, 'spm89-hall')
  const room = await submit('seed-venue-room', 30, 'spm89-room')
  const actors = new Map()
  for (const booking of [hall, room]) {
    const actor = [ROLE_USERS.venueStaff, EXTRA_USERS.venueTechnicalStaff]
      .find((account) => account.name === booking.assignedVenueStaffName)
    expect(actor).toBeTruthy()
    actors.set(booking.id, actor)
    const approval = await request.post(`${DOUBLE_ORIGIN}/api/requests/${eventId}/venue-bookings/${booking.id}/actions`, {
      headers: headers(actor.uid), data: { action: 'approve' },
    })
    expect(approval.status(), await approval.text()).toBe(200)
  }
  const primary = await request.put(`${DOUBLE_ORIGIN}/api/requests/${eventId}/primary-venue`, {
    headers: headers(coordinator.uid), data: { bookingId: hall.id, expectedPrimaryVenueBookingId: null },
  })
  expect(primary.status(), await primary.text()).toBe(200)
  await recordSafetyApproval(request, eventId)
  for (const action of ['confirm', 'start_preparation']) {
    const result = await request.post(`${DOUBLE_ORIGIN}/api/event-requests/${eventId}/transitions`, {
      headers: headers(coordinator.uid), data: { action },
    })
    expect(result.status(), await result.text()).toBe(200)
  }

  await signIn(page, actors.get(hall.id))
  await page.goto(`/requests/${eventId}/venue-bookings?bookingId=${hall.id}`)
  await page.getByLabel(`Venue preparation status for ${hall.venueName}`).selectOption('ready')
  await page.getByLabel(`Venue preparation notes for ${hall.venueName}`).fill('Hall set')
  await page.getByRole('button', { name: 'Save venue preparation' }).click()
  await expect(page.getByText('Venue preparation saved.')).toBeVisible()
  await logout(page)

  await signIn(page, coordinator)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  const indicator = page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Event preparation readiness' }) })
  await expect(indicator.getByRole('status')).toHaveText('Not ready')
  await expect(indicator.getByText(`${hall.venueName}: Ready`)).toBeVisible()
  await expect(indicator.getByText(`${room.venueName}: Not Started`)).toBeVisible()
  await page.getByRole('tab', { name: 'Change Log' }).click()
  await expect(page.getByText(`Venue preparation · ${hall.venueName} · Status`)).toBeVisible()
  await logout(page)

  await signIn(page, actors.get(room.id))
  await page.goto(`/requests/${eventId}/venue-bookings?bookingId=${room.id}`)
  await page.getByLabel(`Venue preparation status for ${room.venueName}`).selectOption('ready')
  await page.getByRole('button', { name: 'Save venue preparation' }).click()
  await expect(page.getByText('Venue preparation saved.')).toBeVisible()
  await logout(page)

  await signIn(page, ROLE_USERS.technicalStaff)
  await page.goto(`/requests/${eventId}?tab=equipment-required`)
  await page.getByLabel('Equipment preparation status').selectOption('ready')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toHaveText('Changes saved.')
  await logout(page)

  await signIn(page, coordinator)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(page.locator('.request-form-section', { has: page.getByRole('heading', { name: 'Event preparation readiness' }) })
    .getByRole('status')).toHaveText('Ready')
  await logout(page)

  await signIn(page, ROLE_USERS.organiser)
  await page.goto(`/requests/${eventId}?tab=venue-details`)
  await expect(page.getByRole('heading', { name: 'Event preparation readiness' })).toHaveCount(0)
  await expect(page.getByText('Hall set')).toHaveCount(0)
})
