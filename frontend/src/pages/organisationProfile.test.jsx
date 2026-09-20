// DOM tests with mocked authentication/API calls; no live Firebase writes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../context/auth-context.js'
import RegisterPage from './RegisterPage.jsx'
import ProfilePage from './ProfilePage.jsx'

afterEach(cleanup)

function showPage(page, overrides = {}) {
  const auth = {
    user: null, userProfile: null, roles: [], register: vi.fn(), logout: vi.fn(),
    updateOrganisationName: vi.fn(), ...overrides,
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[page]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { auth, user: userEvent.setup() }
}

async function fillRegistration(user) {
  await user.type(screen.getByLabelText('Full name'), 'Test Organiser')
  await user.type(screen.getByLabelText('Email address'), 'person@example.com')
  await user.type(screen.getByLabelText('Password', { exact: true }), 'password123')
  await user.type(screen.getByLabelText('Confirm password'), 'password123')
}

function showProfile(overrides = {}) {
  return showPage('/profile', {
    user: { uid: 'user-1', email: 'person@example.com' }, roles: ['organiser'],
    userProfile: { name: 'Test Organiser', organisationName: 'Org A' }, ...overrides,
  })
}

describe('Organiser registration', () => {
  it('requires organisation only for organisers and preserves submitted data on registration failure', async () => {
    const { user, auth } = showPage('/register')
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await fillRegistration(user)
    await user.click(screen.getByRole('radio', { name: /Event Organiser/ }))
    await user.type(screen.getByLabelText('Organisation name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Organisation name is required.')).toBeTruthy()
    expect(auth.register).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Organisation name'))
    await user.type(screen.getByLabelText('Organisation name'), 'Org A')
    auth.register.mockRejectedValueOnce({ code: 'auth/email-already-in-use' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'organiser', organisationName: 'Org A' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'An account with this email already exists.')
    expect(screen.getByLabelText('Organisation name').value).toBe('Org A')
  })

  it('allows attendee registration after switching away from an empty organiser field', async () => {
    const { user, auth } = showPage('/register')
    await fillRegistration(user)
    await user.click(screen.getByRole('radio', { name: /Event Organiser/ }))
    await user.click(screen.getByRole('radio', { name: /Attendee/ }))
    expect(screen.queryByLabelText('Organisation name')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'attendee' }))
  })
})

describe('Organisation profile editing', () => {
  it('shows the organisation for multi-role organisers and hides it for non-organisers', () => {
    showProfile({ roles: ['attendee', 'organiser'] })
    expect(screen.getByText('Org A')).toBeTruthy()
    cleanup()
    showProfile({ roles: ['attendee'] })
    expect(screen.queryByText('Org A')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit organisation name' })).toBeNull()
  })

  it('allows an existing account to add a missing name and validates blank input', async () => {
    const { user, auth } = showProfile({ userProfile: { name: 'Existing Organiser' } })
    expect(screen.getByText('Not provided')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Edit organisation name' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toBe('Organisation name is required.')
    expect(auth.updateOrganisationName).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Organisation name'), '  Org A  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(auth.updateOrganisationName).toHaveBeenCalledWith('Org A')
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Organisation name saved.')
  })

  it('cancels edits without saving and restores the stored name when editing again', async () => {
    const { user, auth } = showProfile()
    await user.click(screen.getByRole('button', { name: 'Edit organisation name' }))
    await user.clear(screen.getByLabelText('Organisation name'))
    await user.type(screen.getByLabelText('Organisation name'), 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Org A')).toBeTruthy()
    expect(auth.updateOrganisationName).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Edit organisation name' }))
    expect(screen.getByLabelText('Organisation name').value).toBe('Org A')
  })

  it('disables controls during saving, retains input on failure, and allows retry', async () => {
    let rejectSave
    const pending = new Promise((resolve, reject) => { rejectSave = reject })
    const { user, auth } = showProfile({ updateOrganisationName: vi.fn().mockReturnValueOnce(pending) })
    await user.click(screen.getByRole('button', { name: 'Edit organisation name' }))
    await user.clear(screen.getByLabelText('Organisation name'))
    await user.type(screen.getByLabelText('Organisation name'), 'Changed Org')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    expect(screen.getByLabelText('Organisation name').disabled).toBe(true)
    rejectSave(new Error('Network unavailable'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save/)
    expect(screen.getByLabelText('Organisation name').value).toBe('Changed Org')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(auth.updateOrganisationName).toHaveBeenCalledTimes(2))
  })
})
