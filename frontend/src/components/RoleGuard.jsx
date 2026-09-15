import { useAuth } from '../hooks/useAuth.js'

// Presentation only: renders children if ANY of the user's roles is allowed (SPM-42 multi-role union).
function RoleGuard({ allowedRoles, children, fallback = null }) {
  const { roles } = useAuth()
  return roles.some((role) => allowedRoles.includes(role)) ? children : fallback
}

export default RoleGuard
