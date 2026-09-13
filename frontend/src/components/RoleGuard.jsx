import { useAuth } from '../hooks/useAuth.js'

function RoleGuard({ allowedRoles, children, fallback = null }) {
  const { role } = useAuth()
  return allowedRoles.includes(role) ? children : fallback
}

export default RoleGuard

