// SPM-1 AC1 — the login form as the user experiences it: fields, submission, error messages and
// where a successful login leads. The authentication context is stubbed here; the real provider is
// covered by tests/spm-1/integration.

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import LoginPage from '../../../frontend/src/pages/LoginPage.jsx'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

function showLogin({ initialEntry = '/login', ...overrides } = {}) {
  const auth = {
    user: null,
    userProfile: null,
    roles: [],
    loading: false,
    login: vi.fn().mockResolvedValue({ roles: ['attendee'] }),
    register: vi.fn(),
    logout: vi.fn(),
    updateOrganisationName: vi.fn(),
    ...overrides,
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { auth, user: userEvent.setup() }
}

function currentPath() {
  return screen.getAllByTestId('current-path').at(-1).textContent
}

async function submitLogin(user, { email, password }) {
  if (email) await user.type(screen.getByLabelText('Email address'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

const CREDENTIALS = { email: 'attendee@seed.connectsphere.test', password: 'Sprint1-Test-Password!' }

describe('SPM-1 — login form (component)', () => {
  it('spm1_login_form_shows_email_password_and_a_way_to_register', () => {
    showLogin()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getByLabelText('Email address').type).toBe('email')
    expect(screen.getByLabelText('Password').type).toBe('password')
    expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(false)
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/register')
  })

  it('spm1_valid_credentials_allow_login', async () => {
    const { auth, user } = showLogin()
    await submitLogin(user, { email: `  ${CREDENTIALS.email}  `, password: CREDENTIALS.password })
    expect(auth.login).toHaveBeenCalledWith(CREDENTIALS.email, CREDENTIALS.password)
    await waitFor(() => expect(currentPath()).toBe('/profile'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('spm1_login_returns_the_user_to_the_protected_page_they_asked_for', async () => {
    const { user } = showLogin({
      initialEntry: { pathname: '/login', state: { from: { pathname: '/requests/drafts' } } },
    })
    await submitLogin(user, CREDENTIALS)
    await waitFor(() => expect(currentPath()).toBe('/requests/drafts'))
  })

  it('spm1_invalid_password_rejects_login', async () => {
    const { auth, user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' }) })
    await submitLogin(user, { ...CREDENTIALS, password: 'wrong-password' })
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.')
    expect(auth.login).toHaveBeenCalledWith(CREDENTIALS.email, 'wrong-password')
    expect(currentPath()).toBe('/login')
    expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(false)
  })

  it('spm1_unregistered_email_rejects_login', async () => {
    const { user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' }) })
    await submitLogin(user, { email: 'nobody@example.test', password: CREDENTIALS.password })
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.')
    expect(currentPath()).toBe('/login')
  })

  it('spm1_missing_email_is_rejected', async () => {
    const { auth, user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/invalid-email' }) })
    await submitLogin(user, { password: CREDENTIALS.password })
    expect((await screen.findByRole('alert')).textContent).toBe('Please enter a valid email address.')
    expect(auth.login).toHaveBeenCalledWith('', CREDENTIALS.password)
    expect(currentPath()).toBe('/login')
  })

  it('spm1_invalid_email_format_is_rejected', async () => {
    const { user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/invalid-email' }) })
    await submitLogin(user, { email: 'not-an-email', password: CREDENTIALS.password })
    expect((await screen.findByRole('alert')).textContent).toBe('Please enter a valid email address.')
    expect(currentPath()).toBe('/login')
  })

  it('spm1_missing_password_is_rejected', async () => {
    const { auth, user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/missing-password' }) })
    await submitLogin(user, { email: CREDENTIALS.email })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent.length).toBeGreaterThan(0)
    expect(auth.login).toHaveBeenCalledWith(CREDENTIALS.email, '')
    expect(currentPath()).toBe('/login')
  })

  it('spm1_empty_credentials_are_rejected', async () => {
    const { user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/invalid-email' }) })
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Please enter a valid email address.')
    expect(currentPath()).toBe('/login')
  })

  it('spm1_account_without_application_profile_is_told_to_contact_support', async () => {
    const { user } = showLogin({ login: vi.fn().mockRejectedValue(new Error('PROFILE_NOT_FOUND')) })
    await submitLogin(user, CREDENTIALS)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Your account profile could not be found. Please contact support.',
    )
    expect(currentPath()).toBe('/login')
  })

  it('spm1_network_and_rate_limit_errors_are_reported_without_leaving_the_form', async () => {
    const { user } = showLogin({ login: vi.fn().mockRejectedValue({ code: 'auth/too-many-requests' }) })
    await submitLogin(user, CREDENTIALS)
    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts. Please wait and try again.')
    expect(screen.getByLabelText('Email address').value).toBe(CREDENTIALS.email)
  })

  it('spm1_submit_is_disabled_while_authentication_is_in_progress', async () => {
    let finishLogin
    const pending = new Promise((resolve) => {
      finishLogin = resolve
    })
    const { user } = showLogin({ login: vi.fn().mockReturnValue(pending) })
    await submitLogin(user, CREDENTIALS)
    const busyButton = screen.getByRole('button', { name: 'Logging in…' })
    expect(busyButton.disabled).toBe(true)
    finishLogin({ roles: ['attendee'] })
    await waitFor(() => expect(currentPath()).toBe('/profile'))
  })

  it('spm1_previous_error_is_cleared_when_login_is_retried', async () => {
    const login = vi.fn().mockRejectedValueOnce({ code: 'auth/invalid-credential' }).mockResolvedValue({})
    const { user } = showLogin({ login })
    await submitLogin(user, { ...CREDENTIALS, password: 'wrong' })
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(currentPath()).toBe('/profile'))
  })

  it('spm1_signed_in_user_is_sent_to_their_profile_instead_of_the_login_form', () => {
    showLogin({ user: { uid: 'uid-1', email: CREDENTIALS.email }, roles: ['attendee'] })
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
    expect(currentPath()).toBe('/profile')
  })
})
