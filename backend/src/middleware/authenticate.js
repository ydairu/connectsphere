import { rolesOf } from '../../../shared/permissions.js'
import { getAdminAuth, getAdminDb } from '../config/firebaseAdmin.js'

export async function authenticate(req, res, next) {
  const authorization = req.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const token = authorization.slice(7).trim()
  if (!token) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(token)
    const profileSnapshot = await getAdminDb().collection('users').doc(decodedToken.uid).get()

    if (!profileSnapshot.exists) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const profile = profileSnapshot.data()
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
