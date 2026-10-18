import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listNotifications, markNotificationRead } from '../services/api.js'

// The signed-in user's in-app notifications. Venue booking rejections link to the booking; other notices
// link to the event. The API returns only the user's own.

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    async function loadNotifications() {
      try {
        const response = await listNotifications(user)
        if (active) setNotifications(response.notifications)
      } catch (loadError) {
        if (active) setError(loadError.status === 401 ? 'Your session has expired. Please log in again.' : 'We could not load your notifications. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadNotifications()
    return () => {
      active = false
    }
  }, [user])

  async function markRead(id) {
    try {
      const { notification } = await markNotificationRead(user, id)
      setNotifications((current) => current.map((item) => (item.id === id ? notification : item)))
    } catch {
      setError('We could not update this notification. Please try again.')
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <h1>Notifications</h1>
            <p>Updates about events you are involved in.</p>
          </div>
        </div>

        {loading && <Card><LoadingSpinner label="Loading notifications" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && notifications.length === 0 && (
          <Card className="empty-state">
            <h2>No notifications</h2>
            <p>You have no notifications yet.</p>
          </Card>
        )}

        {!loading && notifications.length > 0 && (
          <ul className="request-list" aria-label="Notifications">
            {notifications.map((notification) => {
              const when = formatDateTime(notification.createdAt)
              const unread = notification.readAt == null
              return (
                <li key={notification.id}>
                  <Card className="request-item">
                    <div className="request-item-main">
                      <h2>{notification.message}</h2>
                      {notification.reason && <p>Reason: {notification.reason}</p>}
                      <p className="request-meta">{[unread ? 'Unread' : 'Read', when].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="request-item-actions">
                      {unread && (
                        <Button type="button" variant="secondary" className="button-small" onClick={() => markRead(notification.id)}>
                          Mark as read
                        </Button>
                      )}
                      <Link className="button button-secondary button-small" to={notification.bookingRequestId
                        ? `/requests/${notification.eventRequestId}/venue-bookings?bookingId=${encodeURIComponent(notification.bookingRequestId)}`
                        : `/requests/${notification.eventRequestId}`}>{notification.bookingRequestId ? 'View booking' : 'View event'}</Link>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}

export default NotificationsPage
