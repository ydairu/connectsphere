// SPM-2 AC1, AC2, AC4 and client-side validation — the registration form as a user sees it.
// The authentication context is stubbed; account creation itself is covered by tests/spm-2/integration.

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext } from '../../../frontend/src/context/auth-context.js'
import RegisterPage from '../../../frontend/src/pages/RegisterPage.jsx'
import { ATTENDEE, ORGANISER } from '../../../shared/permissions.js'
import { ATTENDEE_REGISTRATION, INTERNAL_ROLE_LABELS, ORGANISER_REGISTRATION } from '../fixtures/registrations.js'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

function showRegister(overrides = {}) {
  const auth = {
    user: null,
    userProfile: null,
    roles: [],
    loading: false,
    login: vi.fn(),
    register: vi.fn().mockResolvedValue({}),
    logout: vi.fn(),
    updateOrganisationName: vi.fn(),
    ...overrides,
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { auth, user: userEvent.setup() }
}

const currentPath = () => screen.getByTestId('current-path').textContent
const field = (label) => screen.getByLabelText(label, { exact: true })
const radio = (name) => screen.getByRole('radio', { name })

async function fillCommonFields(user, { name, email, password }) {
  if (name) await user.type(field('Full name'), name)
  if (email) await user.type(field('Email address'), email)
  if (password) {
    await user.type(field('Password'), password)
    await user.type(field('Confirm password'), password)
  }
}

async function submit(user) {
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('SPM-2 — account type selection (component)', () => {
  it('spm2_registration_allows_event_organiser', () => {
    showRegister()
    const organiser = radio(/Event Organiser/)
    expect(organiser.value).toBe(ORGANISER)
    expect(organiser.disabled).toBe(false)
  })

  it('spm2_registration_allows_attendee', () => {
    showRegister()
    const attendee = radio(/Attendee/)
    expect(attendee.value).toBe(ATTENDEE)
    expect(attendee.checked).toBe(true)
  })

  it('spm2_registration_does_not_offer_internal_roles', () => {
    showRegister()
    const options = screen.getAllByRole('radio').map((input) => input.value)
    expect(options.sort()).toEqual([ATTENDEE, ORGANISER].sort())
    expect(screen.queryByRole('combobox')).toBeNull()
    for (const label of INTERNAL_ROLE_LABELS) {
      expect(screen.queryByText(label)).toBeNull()
      expect(screen.queryByRole('radio', { name: new RegExp(label) })).toBeNull()
    }
  })
})

describe('SPM-2 — dynamic registration form (component)', () => {
  it.each([
    ['Attendee', /Attendee/],
    ['Event Organiser', /Event Organiser/],
  ])('spm2_common_registration_fields_are_displayed_for_%s', async (_label, option) => {
    const { user } = showRegister()
    await user.click(radio(option))
    expect(field('Full name').required).toBe(true)
    expect(field('Email address').type).toBe('email')
    expect(field('Password').type).toBe('password')
    expect(field('Confirm password').type).toBe('password')
  })

  it('spm2_organiser_registration_displays_organisation', async () => {
    const { user } = showRegister()
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await user.click(radio(/Event Organiser/))
    expect(field('Organisation name').required).toBe(true)
  })

  it('spm2_attendee_registration_does_not_require_organisation', async () => {
    const { user, auth } = showRegister()
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await fillCommonFields(user, ATTENDEE_REGISTRATION)
    await submit(user)
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ role: ATTENDEE }))
    expect(screen.queryByText('Organisation name is required.')).toBeNull()
  })

  it('spm2_switching_account_type_shows_and_hides_the_organisation_field', async () => {
    const { user } = showRegister()
    await user.click(radio(/Event Organiser/))
    await user.type(field('Organisation name'), 'Example Events Ltd')
    await user.click(radio(/Attendee/))
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await user.click(radio(/Event Organiser/))
    expect(field('Organisation name').value).toBe('Example Events Ltd')
  })
})

describe('SPM-2 — registration validation (component)', () => {
  const valid = ORGANISER_REGISTRATION

  it.each([
    ['name', { ...valid, name: '' }, 'Full name is required.'],
    ['name (whitespace only)', { ...valid, name: '   ' }, 'Full name is required.'],
    ['email', { ...valid, email: '' }, 'Enter a valid email address.'],
    ['email format', { ...valid, email: 'not-an-email' }, 'Enter a valid email address.'],
    ['password', { ...valid, password: '' }, 'Password must contain at least 6 characters.'],
    ['password length', { ...valid, password: 'abc' }, 'Password must contain at least 6 characters.'],
    ['organisation', { ...valid, organisationName: '' }, 'Organisation name is required.'],
    ['organisation (whitespace only)', { ...valid, organisationName: '   ' }, 'Organisation name is required.'],
  ])('spm2_missing_%s_is_rejected_before_submission', async (_label, values, message) => {
    const { user, auth } = showRegister()
    await user.click(radio(/Event Organiser/))
    await fillCommonFields(user, values)
    if (values.organisationName) await user.type(field('Organisation name'), values.organisationName)
    await submit(user)
    expect(screen.getByText(message)).toBeTruthy()
    expect(auth.register).not.toHaveBeenCalled()
    expect(currentPath()).toBe('/register')
  })

  it('spm2_mismatched_password_confirmation_is_rejected', async () => {
    const { user, auth } = showRegister()
    await user.type(field('Full name'), valid.name)
    await user.type(field('Email address'), valid.email)
    await user.type(field('Password'), valid.password)
    await user.type(field('Confirm password'), `${valid.password}-different`)
    await submit(user)
    expect(screen.getByText('Passwords do not match.')).toBeTruthy()
    expect(auth.register).not.toHaveBeenCalled()
  })

  it('spm2_invalid_fields_are_marked_for_assistive_technology', async () => {
    const { user } = showRegister()
    await submit(user)
    const name = field('Full name')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(name.getAttribute('aria-describedby')).textContent).toBe('Full name is required.')
  })
})

describe('SPM-2 — registration submission (component)', () => {
  it('spm2_attendee_can_register', async () => {
    const { user, auth } = showRegister()
    await fillCommonFields(user, { ...ATTENDEE_REGISTRATION, name: `  ${ATTENDEE_REGISTRATION.name}  ` })
    await submit(user)
    expect(auth.register).toHaveBeenCalledWith({
      name: ATTENDEE_REGISTRATION.name,
      email: ATTENDEE_REGISTRATION.email,
      password: ATTENDEE_REGISTRATION.password,
      role: ATTENDEE,
      organisationName: '',
    })
    await waitFor(() => expect(currentPath()).toBe('/profile'))
  })

  it('spm2_event_organiser_can_register', async () => {
    const { user, auth } = showRegister()
    await user.click(radio(/Event Organiser/))
    await fillCommonFields(user, ORGANISER_REGISTRATION)
    await user.type(field('Organisation name'), ORGANISER_REGISTRATION.organisationName)
    await submit(user)
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({
      role: ORGANISER,
      organisationName: ORGANISER_REGISTRATION.organisationName,
    }))
    await waitFor(() => expect(currentPath()).toBe('/profile'))
  })

  it('spm2_duplicate_email_displays_clear_error', async () => {
    const { user, auth } = showRegister({ register: vi.fn().mockRejectedValue({ code: 'auth/email-already-in-use' }) })
    await fillCommonFields(user, ATTENDEE_REGISTRATION)
    await submit(user)
    expect((await screen.findByRole('alert')).textContent).toBe('An account with this email already exists.')
    expect(auth.register).toHaveBeenCalledOnce()
    expect(currentPath()).toBe('/register')
    expect(field('Email address').value).toBe(ATTENDEE_REGISTRATION.email)
    expect(screen.getByRole('button', { name: 'Create account' }).disabled).toBe(false)
  })

  it('spm2_weak_password_rejected_by_the_backend_is_reported', async () => {
    const { user } = showRegister({ register: vi.fn().mockRejectedValue({ code: 'auth/weak-password' }) })
    await fillCommonFields(user, ATTENDEE_REGISTRATION)
    await submit(user)
    expect((await screen.findByRole('alert')).textContent).toBe('Password must contain at least 6 characters.')
    expect(currentPath()).toBe('/register')
  })

  it('spm2_rejected_registration_role_does_not_create_an_account_or_leave_the_form', async () => {
    const { user } = showRegister({ register: vi.fn().mockRejectedValue(new Error('Invalid registration role.')) })
    await fillCommonFields(user, ATTENDEE_REGISTRATION)
    await submit(user)
    expect((await screen.findByRole('alert')).textContent.length).toBeGreaterThan(0)
    expect(currentPath()).toBe('/register')
  })

  it('spm2_submit_is_disabled_while_the_account_is_being_created', async () => {
    let finish
    const pending = new Promise((resolve) => {
      finish = resolve
    })
    const { user } = showRegister({ register: vi.fn().mockReturnValue(pending) })
    await fillCommonFields(user, ATTENDEE_REGISTRATION)
    await submit(user)
    expect(screen.getByRole('button', { name: 'Creating account…' }).disabled).toBe(true)
    finish({})
    await waitFor(() => expect(currentPath()).toBe('/profile'))
  })

  it('spm2_signed_in_user_is_redirected_away_from_registration', () => {
    showRegister({ user: { uid: 'uid-1', email: 'person@example.test' }, roles: [ATTENDEE] })
    expect(screen.queryByRole('heading', { name: 'Create your account' })).toBeNull()
    expect(currentPath()).toBe('/profile')
  })
})
