import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

function Navbar() {
  const { user } = useAuth()

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ConnectSphere</span>
        </Link>
        <div className="nav-actions">
          {user ? (
            <NavLink className="button button-secondary button-small" to="/profile">Profile</NavLink>
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

