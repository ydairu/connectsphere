import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { roleLabel } from '../utils/roleLabels.js'

// SPM-42 #2 — a signed-in user without permission is told they lack access. Sending them to /login
// would be wrong: that is SPM-1's rule for users who are not signed in.
function ForbiddenPage() {
  const { roles } = useAuth()

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <Card className="empty-state">
          <span className="eyebrow">403 — access denied</span>
          <h2>You do not have access to this page</h2>
          <p>
            Your account{roles.length > 0 ? ` (${roles.map(roleLabel).join(', ')})` : ''} cannot view this part of
            ConnectSphere. If you think this is wrong, ask the Event Coordinator to check your roles.
          </p>
          <Link className="button button-primary" to="/">Back to home</Link>
        </Card>
      </main>
    </div>
  )
}

export default ForbiddenPage
