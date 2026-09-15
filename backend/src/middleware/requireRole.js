import { rolesOf } from '../../../shared/permissions.js'

// Route-level gate: allows the request if ANY of the user's roles is in allowedRoles — a multi-role
// user receives the union of their roles' access (SPM-42). This is only "may this role reach the
// route"; record scope, state gate and section checks still belong to shared/permissions.js.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !rolesOf(req.user).some((role) => allowedRoles.includes(role))) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    return next()
  }
}
