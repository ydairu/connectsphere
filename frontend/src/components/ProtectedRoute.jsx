import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import ForbiddenPage from '../pages/ForbiddenPage.jsx'
import { isRouteAllowed } from '../utils/access.js'
import LoadingSpinner from './LoadingSpinner.jsx'

// Not signed in → /login (SPM-1). Signed in but not permitted → 403 page, never a redirect to login
// (SPM-42 #2). `allowedRoles` is optional; without it the route is open to any signed-in user.
function ProtectedRoute({ allowedRoles }) {
  const { user, roles, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main className="centered-page"><LoadingSpinner label="Checking your session" /></main>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isRouteAllowed(roles, allowedRoles)) {
    return <ForbiddenPage />
  }

  return <Outlet />
}

export default ProtectedRoute
