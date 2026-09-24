// SPM-2 AC1–AC5 in the running application: a user registers through the real form, real
// AuthProvider and router, then can reach only the pages their new role permits. Firebase is the
// in-memory fake; the Express API is stubbed (it has its own Supertest suite).

import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestListCopy } from '../../../frontend/src/utils/requestListCopy.js'
import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import { ROLE_USERS, TEST_PASSWORD } from '../../shared/fixtures/testUsers.js'
import { FORBIDDEN_HEADING, LOGIN_HEADING, currentPath, renderApp, stubApi } from '../../shared/helpers/renderApp.jsx'
import { fake } from '../../shared/mocks/firebaseClientMock.js'
import { ATTENDEE_REGISTRATION, ORGANISER_REGISTRATION } from '../fixtures/registrations.js'

const EXISTING = ROLE_USERS.attendee

beforeEach(() => {
  stubApi()
  fake.seedAccount(EXISTING)
})

async function registerThroughForm(registration) {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Create your account' })
  if (registration.role === ORGANISER) {
    await user.click(screen.getByRole('radio', { name: /Event Organiser/ }))
    await user.type(screen.getByLabelText('Organisation name'), registration.organisationName)
  }
  await user.type(screen.getByLabelText('Full name'), registration.name)
  await user.type(screen.getByLabelText('Email address'), registration.email)
  await user.type(screen.getByLabelText('Password', { exact: true }), registration.password)
  await user.type(screen.getByLabelText('Confirm password'), registration.password)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  return user
}

async function expectProfilePage() {
  await screen.findByRole('heading', { name: 'Profile' })
  expect(currentPath()).toBe('/profile')
}

describe('SPM-2 AC3/AC5 — Attendee registration and access (integration)', () => {
  it('spm2_registered_attendee_has_correct_permissions', async () => {
    renderApp('/register')
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await registerThroughForm(ATTENDEE_REGISTRATION)

    await expectProfilePage()
    expect(screen.getByText(ATTENDEE_REGISTRATION.name)).toBeTruthy()
    expect(screen.getByText('Attendee')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Requests' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'My drafts' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create request' })).toBeNull()
    cleanup()

    renderApp('/requests')
    await screen.findByRole('heading', { name: requestListCopy([ATTENDEE]).title })
  })

  it('spm2_registered_user_cannot_access_unauthorised_role', async () => {
    renderApp('/register')
    await registerThroughForm(ATTENDEE_REGISTRATION)
    await expectProfilePage()

    for (const path of ['/requests/drafts', '/event-requests/new']) {
      cleanup()
      renderApp(path)
      await screen.findByRole('heading', { name: FORBIDDEN_HEADING })
      expect(screen.getByText(/\(Attendee\)/)).toBeTruthy()
      expect(currentPath()).toBe(path)
    }
  })

  it('spm2_registered_attendee_can_log_out_and_log_in_again', async () => {
    renderApp('/register')
    await registerThroughForm(ATTENDEE_REGISTRATION)
    await expectProfilePage()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('heading', { level: 1, name: /Manage events/ })
    cleanup()

    renderApp('/profile')
    await screen.findByRole('heading', { name: LOGIN_HEADING })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email address'), ATTENDEE_REGISTRATION.email)
    await user.type(screen.getByLabelText('Password'), ATTENDEE_REGISTRATION.password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await expectProfilePage()
    expect(screen.getByText('Attendee')).toBeTruthy()
  })
})

describe('SPM-2 AC2/AC3/AC5 — Event Organiser registration and access (integration)', () => {
  it('spm2_registered_event_organiser_has_correct_permissions', async () => {
    renderApp('/register')
    await registerThroughForm(ORGANISER_REGISTRATION)

    await expectProfilePage()
    expect(screen.getByText('Event Organiser')).toBeTruthy()
    expect(screen.getByText(ORGANISER_REGISTRATION.organisationName)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'My drafts' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create request' })).toBeTruthy()
    cleanup()

    renderApp('/requests/drafts')
    await screen.findByRole('heading', { name: 'Saved drafts' })
    expect(screen.queryByRole('heading', { name: FORBIDDEN_HEADING })).toBeNull()
    cleanup()

    renderApp('/event-requests/new')
    await screen.findByRole('heading', { name: 'Create Event Request' })
  })

  it('spm2_event_organiser_requires_organisation_in_the_form', async () => {
    renderApp('/register')
    await registerThroughForm({ ...ORGANISER_REGISTRATION, organisationName: '   ' })
    expect(screen.getByText('Organisation name is required.')).toBeTruthy()
    expect(currentPath()).toBe('/register')
    expect(fake.state.calls.createUser).toEqual([])
  })
})

describe('SPM-2 AC4 — duplicate email in the running application (integration)', () => {
  it('spm2_duplicate_email_displays_clear_error_and_creates_nothing', async () => {
    renderApp('/register')
    const before = fake.snapshot()
    await registerThroughForm({ ...ATTENDEE_REGISTRATION, email: EXISTING.email })

    expect((await screen.findByRole('alert')).textContent).toBe('An account with this email already exists.')
    expect(currentPath()).toBe('/register')
    expect(fake.snapshot()).toEqual(before)
    expect(fake.state.auth.currentUser).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' }).disabled).toBe(false))
    expect(screen.getByLabelText('Email address').value).toBe(EXISTING.email)
  })
})
