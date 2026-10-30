import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listNotifications, markNotificationRead } from '../services/api.js'
import {
  ATTENDEE_EVENT_CANCELLED_NOTICE,
  EVENT_REASSIGNED_AWAY_NOTICE,
  EVENT_RESCHEDULED_NOTICE,
  NEW_UNASSIGNED_REQUEST_NOTICE,
  REQUEST_CONFIRMED_NOTICE,
  REQUEST_RETURNED_NOTICE,
} from '../../../shared/notifications.js'

// The signed-in user's in-app notifications. Venue booking rejections link to the booking; other notices
// link to the event, except where linkFor() says otherwise, and a notice with no link shows none (SPM-84). The API
// returns only the user's own.

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// SPM-41: "start to end", or the start alone when the end is unknown.
function periodText(start, end) {
  return [formatDateTime(start), formatDateTime(end)].filter(Boolean).join(' to ') || 'Not set'
}

// SPM-61: a returned request is edited on its event page, and a confirmed event's arrangements are shown
// there, so both link to it under a label that says what the Organiser will find.
function linkFor(notification) {
  // SPM-84: the previous Coordinator no longer has the event, so their reassignment notice has no link.
  if (notification.type === EVENT_REASSIGNED_AWAY_NOTICE) return null
  if (notification.bookingRequestId) {
    return {
      to: `/requests/${notification.eventRequestId}/venue-bookings?bookingId=${encodeURIComponent(notification.bookingRequestId)}`,
      label: 'View booking',
    }
  }
  // SPM-41: an Attendee cannot open a cancelled event or one moved back to Planning, so their notices lead to
  // My registrations, which shows the event as it now is.
  if ([ATTENDEE_EVENT_CANCELLED_NOTICE, EVENT_RESCHEDULED_NOTICE].includes(notification.type)) {
    return { to: '/registrations', label: 'View my registrations' }
  }
  // SPM-85: the Lead assigns from the queue, and cannot open the event once another Lead has assigned it.
  if (notification.type === NEW_UNASSIGNED_REQUEST_NOTICE) return { to: '/requests/unassigned', label: 'View unassigned requests' }
  const to = `/requests/${notification.eventRequestId}`
  if (notification.type === REQUEST_RETURNED_NOTICE) return { to, label: 'Edit request' }
  if (notification.type === REQUEST_CONFIRMED_NOTICE) return { to, label: 'View arrangements' }
  return { to, label: 'View event' }
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
              const link = linkFor(notification)
              const reasonLabel = notification.type === REQUEST_RETURNED_NOTICE ? 'Message from the coordinator' : 'Reason'
              return (
                <li key={notification.id}>
                  <Card className="request-item">
                    <div className="request-item-main">
                      <h2>{notification.message}</h2>
                      {notification.reason && <p>{reasonLabel}: {notification.reason}</p>}
                      {/* SPM-19: a registration confirmation carries the event's start, shown in the reader's time zone. */}
                      {notification.type === EVENT_RESCHEDULED_NOTICE ? (
                        // SPM-41: the new and previous time, in the reader's time zone.
                        <>
                          <p>New date and time: {periodText(notification.eventStartsAt, notification.eventEndsAt)}</p>
                          <p>Previously: {periodText(notification.previousStartsAt, notification.previousEndsAt)}</p>
                        </>
                      ) : formatDateTime(notification.eventStartsAt) && <p>Event starts: {formatDateTime(notification.eventStartsAt)}</p>}
                      <p className="request-meta">{[unread ? 'Unread' : 'Read', when].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="request-item-actions">
                      {unread && (
                        <Button type="button" variant="secondary" className="button-small" onClick={() => markRead(notification.id)}>
                          Mark as read
                        </Button>
                      )}
                      {link && <Link className="button button-secondary button-small" to={link.to}>{link.label}</Link>}
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
