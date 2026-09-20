import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { rolesOf } from '../../../shared/permissions.js'
import { buildRegistrationProfile } from '../../../shared/userProfile.js'
import { auth, db } from '../services/firebase.js'
import { updateApiProfile } from '../services/api.js'
import { AuthContext } from './auth-context.js'

async function fetchUserProfile(uid) {
  const profileSnapshot = await getDoc(doc(db, 'users', uid))
  return profileSnapshot.exists() ? profileSnapshot.data() : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (!currentUser) {
        setUserProfile(null)
        setLoading(false)
        return
      }

      try {
        setUserProfile(await fetchUserProfile(currentUser.uid))
      } catch {
        setUserProfile(null)
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const profile = await fetchUserProfile(credential.user.uid)

    if (!profile) {
      await signOut(auth)
      throw new Error('PROFILE_NOT_FOUND')
    }

    setUserProfile(profile)
    return profile
  }

  async function register({ name, email, password, role, organisationName }) {
    const profile = buildRegistrationProfile({ name, email, role, organisationName })
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    try {
      await updateProfile(credential.user, { displayName: name })

      await setDoc(doc(db, 'users', credential.user.uid), {
        ...profile,
        createdAt: serverTimestamp(),
      })
      setUserProfile(profile)
      return profile
    } catch (error) {
      await deleteUser(credential.user).catch(() => {})
      throw error
    }
  }

  async function updateOrganisationName(organisationName) {
    const currentUser = auth.currentUser
    if (!currentUser) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 })
    const { organisationName: savedName } = await updateApiProfile(currentUser, { organisationName })
    if (auth.currentUser?.uid === currentUser.uid) {
      setUserProfile((current) => current ? { ...current, organisationName: savedName } : current)
    }
  }

  async function logout() {
    await signOut(auth)
  }

  const value = useMemo(
    () => ({
      user,
      userProfile,
      // A user may hold several roles (SPM-42). Presentation only — the API enforces access.
      roles: rolesOf(userProfile),
      loading,
      login,
      register,
      updateOrganisationName,
      logout,
    }),
    [user, userProfile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
