import { Link, NavLink } from 'react-router-dom'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { useAuth } from '../hooks/useAuth.js'

function Navbar() {
  const { user, roles } = useAuth()
  const isOrganiser = roles.includes(ORGANISER)
  const isCoordinator = roles.includes(COORDINATOR)
  const isVenueStaff = roles.includes(VENUE_STAFF)
  const isTechnicalStaff = roles.includes(TECHNICAL_STAFF)

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ConnectSphere</span>
        </Link>
        <div className="nav-actions">
          {user ? (
            <>
              <NavLink className="nav-link" to="/requests">Requests</NavLink>
              <NavLink className="nav-link" to="/notifications">Notifications</NavLink>
              {isOrganiser && <NavLink className="nav-link" to="/requests/drafts">My drafts</NavLink>}
              {isOrganiser && <NavLink className="nav-link" to="/event-requests/new">Create request</NavLink>}
              {(isCoordinator || isVenueStaff) && <NavLink className="nav-link" to="/venues">Venues</NavLink>}
              {isVenueStaff && <NavLink className="nav-link" to="/venues/new">Add venue</NavLink>}
              {(isCoordinator || isTechnicalStaff) && <NavLink className="nav-link" to="/equipment">Equipment</NavLink>}
              <NavLink className="button button-secondary button-small" to="/profile">Profile</NavLink>
            </>
          ) : (
            <>
              <NavLink className="nav-link" to="/login">Log in</NavLink>
              <NavLink className="button button-primary button-small" to="/register">Get started</NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

export default Navbar
