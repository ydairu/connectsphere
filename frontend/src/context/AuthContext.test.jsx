// Profile persistence through the real AuthProvider with Firebase and HTTP mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'

const fake = vi.hoisted(() => ({
  auth: { currentUser: null }, profiles: new Map(), listener: null,
  createUser: vi.fn(), deleteUser: vi.fn(), setDoc: vi.fn(), updateDisplayName: vi.fn(),
}))
vi.mock('../services/firebase.js', () => ({ auth: fake.auth, db: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, listener) => {
    fake.listener = listener
    listener(fake.auth.currentUser)
    return () => { fake.listener = null }
  },
  createUserWithEmailAndPassword: fake.createUser,
  deleteUser: fake.deleteUser,
  updateProfile: fake.updateDisplayName,
  signInWithEmailAndPassword: async () => {
    fake.auth.currentUser = { uid: 'user-1', getIdToken: async () => 'test-token' }
    await fake.listener(fake.auth.currentUser)
    return { user: fake.auth.currentUser }
  },
  signOut: async () => {
    fake.auth.currentUser = null
    await fake.listener(null)
  },
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, uid) => ({ collection, uid }),
  getDoc: async ({ uid }) => ({ exists: () => fake.profiles.has(uid), data: () => fake.profiles.get(uid) }),
  setDoc: fake.setDoc,
  serverTimestamp: () => 'server-timestamp',
}))

beforeEach(() => {
  fake.auth.currentUser = null
  fake.profiles.clear()
  fake.createUser.mockReset().mockImplementation(async () => {
    fake.auth.currentUser = { uid: 'user-1', getIdToken: async () => 'test-token' }
    return { user: fake.auth.currentUser }
  })
  fake.setDoc.mockReset().mockImplementation(async ({ uid }, profile) => { fake.profiles.set(uid, profile) })
  fake.deleteUser.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const update = JSON.parse(options.body)
    fake.profiles.set('user-1', { ...fake.profiles.get('user-1'), ...update })
    return { ok: true, json: async () => update }
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const registration = { name: 'Organiser', email: 'person@example.com', password: 'password123', role: 'organiser', organisationName: ' Org A ' }

describe('Organisation name persistence', () => {
  it('persists registration and profile edits, restores a session, and retains the name after logout/login', async () => {
    const { result, unmount } = renderHook(useAuth, { wrapper: AuthProvider })
    await act(() => result.current.register(registration))
    expect(fake.profiles.get('user-1')).toMatchObject({ organisationName: 'Org A', createdAt: 'server-timestamp' })
    expect(result.current.userProfile.organisationName).toBe('Org A')

    await act(() => result.current.updateOrganisationName('Org B'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/profile'), expect.objectContaining({
      method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      body: JSON.stringify({ organisationName: 'Org B' }),
    }))
    expect(result.current.userProfile.organisationName).toBe('Org B')
    unmount()

    const restored = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(restored.result.current.userProfile?.organisationName).toBe('Org B'))
    await act(() => restored.result.current.logout())
    expect(restored.result.current.userProfile).toBeNull()
    await act(() => restored.result.current.login(registration.email, registration.password))
    expect(restored.result.current.userProfile.organisationName).toBe('Org B')
  })

  it('does not save organisation details for attendees', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await act(() => result.current.register({ ...registration, role: 'attendee' }))
    expect(fake.profiles.get('user-1')).not.toHaveProperty('organisationName')
  })

  it('rejects a missing organisation before creating an auth account', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await expect(result.current.register({ ...registration, organisationName: ' ' })).rejects.toMatchObject({ code: 'profile/invalid-organisation' })
    expect(fake.createUser).not.toHaveBeenCalled()
  })

  it('cleans up the auth account when the registration profile write fails', async () => {
    fake.setDoc.mockRejectedValueOnce(new Error('Write failed'))
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await expect(result.current.register(registration)).rejects.toThrow('Write failed')
    expect(fake.deleteUser).toHaveBeenCalledWith(fake.auth.currentUser)
    expect(fake.profiles.size).toBe(0)
  })

  it('keeps the saved profile name if the API rejects an update', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await act(() => result.current.register(registration))
    fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) })
    await expect(result.current.updateOrganisationName('Changed')).rejects.toMatchObject({ status: 403 })
    expect(result.current.userProfile.organisationName).toBe('Org A')
  })
})
