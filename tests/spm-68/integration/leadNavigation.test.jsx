// SPM-68 through the whole application (router, real AuthProvider, real pages): the Unassigned requests link
// and page are for Event Coordinator Leads only. Firebase is the in-memory fake; the Express API is stubbed.
// This is presentation only — the API's 403 is covered by unassignedQueueApi.test.js.

import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'
import { COORDINATOR, COORDINATOR_LEAD } from '../../../shared/permissions.js'
import { ALL_ROLE_USERS } from '../../shared/fixtures/testUsers.js'
import { FORBIDDEN_HEADING, renderApp, stubApi } from '../../shared/helpers/renderApp.jsx'
import { fake } from '../../shared/mocks/firebaseClientMock.js'

const lead = SEED_ACCOUNTS.coordinatorLead
const leadCoordinator = { uid: 'spm68-lead-coordinator', email: 'lead-coordinator@seed.connectsphere.test', name: 'Lead And Coordinator', roles: [COORDINATOR_LEAD, COORDINATOR] }

beforeEach(() => {
  stubApi()
  for (const account of [...ALL_ROLE_USERS, lead, leadCoordinator]) fake.seedAccount(account)
})

const navigation = () => within(screen.getByRole('navigation', { name: 'Main navigation' }))

describe('SPM-68 — the Unassigned requests page is for Leads only', () => {
  it('a Lead sees the navbar link and the page', async () => {
    fake.restoreSession(lead)
    renderApp('/requests/unassigned')
    expect(await screen.findByRole('heading', { level: 1, name: 'Unassigned requests' })).toBeTruthy()
    expect(navigation().getByRole('link', { name: 'Unassigned requests' }).getAttribute('href')).toBe('/requests/unassigned')
  })

  it('a Lead who is also a Coordinator sees the link too', async () => {
    fake.restoreSession(leadCoordinator)
    renderApp('/requests')
    await screen.findByRole('navigation', { name: 'Main navigation' })
    expect(await navigation().findByRole('link', { name: 'Unassigned requests' })).toBeTruthy()
  })

  it.each(ALL_ROLE_USERS.map((account) => [account.roles.join('+'), account]))('%s sees no link and is refused the page', async (_label, account) => {
    fake.restoreSession(account)
    renderApp('/requests/unassigned')
    expect(await screen.findByRole('heading', { name: FORBIDDEN_HEADING })).toBeTruthy()
    expect(navigation().queryByRole('link', { name: 'Unassigned requests' })).toBeNull()
  })
})
