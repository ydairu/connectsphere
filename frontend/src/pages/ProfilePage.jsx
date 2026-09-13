import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Navbar from '../components/Navbar.jsx'
import RoleBadge from '../components/RoleBadge.jsx'
import { useAuth } from '../hooks/useAuth.js'

function ProfilePage() {
  const { user, userProfile, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    navigate('/', { replace: true })
  }

  if (!userProfile) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="profile-page container">
          <Card className="empty-profile">
            <h1>Profile unavailable</h1>
            <p>We could not load the Firestore profile linked to this account.</p>
            <Button onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Return to home'}</Button>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="profile-page container">
        <div className="profile-heading">
          <div>
            <span className="eyebrow">Your account</span>
            <h1>Profile</h1>
            <p>Your account details and access role.</p>
          </div>
          <Button variant="secondary" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</Button>
        </div>
        <Card className="profile-card">
          <div className="avatar" aria-hidden="true">{userProfile.name?.charAt(0).toUpperCase()}</div>
          <div className="profile-details">
            <div className="profile-row"><span>Name</span><strong>{userProfile.name}</strong></div>
            <div className="profile-row"><span>Email</span><strong>{userProfile.email || user.email}</strong></div>
            <div className="profile-row"><span>Role</span><div className="role-value"><strong>{userProfile.role === 'employee' ? 'Employee' : 'Attendee'}</strong><RoleBadge role={userProfile.role} /></div></div>
          </div>
        </Card>
      </main>
    </div>
  )
}

export default ProfilePage
