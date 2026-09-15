import { rolesOf } from '../../../shared/permissions.js'
import { getAdminAuth, getAdminDb } from '../config/firebaseAdmin.js'

// Token verification and profile loading are injected so the API tests can run this middleware
// unchanged against in-memory users. Production uses the Firebase Admin SDK below.
export function createAuthenticate({ verifyIdToken, loadProfile }) {
  return async function authenticate(req, res, next) {
    const authorization = req.get('authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const token = authorization.slice(7).trim()
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    try {
      const decodedToken = await verifyIdToken(token)
      const profile = await loadProfile(decodedToken.uid)

      if (!profile) {
        return res.status(401).json({ message: 'Unauthorized' })
      }

      req.user = {
        uid: decodedToken.uid,
        email: profile.email || decodedToken.email,
        // SPM-42: a user may hold several roles. rolesOf() reads `roles ?? [role]`, so single-role
        // profiles written before the migration keep working. There is deliberately no singular `role`.
        roles: rolesOf(profile),
        // Organisation scoping reads the company ID, never the name (SPM-42, Clarification 1).
        organisationId: profile.organisationId ?? null,
        organisationName: profile.organisationName ?? null,
        name: profile.name,
      }
      return next()
    } catch (error) {
      if (error.message === 'Firebase Admin environment variables are not configured.') {
        return next(error)
      }
      return res.status(401).json({ message: 'Unauthorized' })
    }
  }
}

export const authenticate = createAuthenticate({
  verifyIdToken: (token) => getAdminAuth().verifyIdToken(token),
  loadProfile: async (uid) => {
    const profileSnapshot = await getAdminDb().collection('users').doc(uid).get()
    return profileSnapshot.exists ? profileSnapshot.data() : null
  },
})
