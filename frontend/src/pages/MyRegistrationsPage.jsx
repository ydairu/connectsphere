import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listMyRegistrations } from '../services/api.js'
import { displayDateTime, eventStatusNote, registrationStatusLabel, venueText } from '../utils/registration.js'
import { registrationEligibleStatus } from '../../../shared/status.js'

// SPM-19 — "view my registration status". The signed-in Attendee's registrations, soonest event first, from
// GET /api/registrations, which returns only the caller's own. Each one keeps the event's name, time and venue
// as registered, so it still reads correctly if the event later leaves the Attendee's view. SPM-41: the date,
// time and status are the event's current ones, with a note when it is cancelled or being rearranged.

function MyRegistrationsPage() {
  const { user } = useAuth()
  const [registrations, setRegistrations] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    listMyRegistrations(user)
      .then((response) => { if (active) setRegistrations(response.registrations) })
      .catch((loadError) => {
        if (active) setError(loadError.status === 401 ? 'Your session has expired. Please log in again.' : 'We could not load your registrations. Please try again.')
      })
    return () => { active = false }
  }, [user])

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <h1>My registrations</h1>
            <p>Events you have registered for, and the status of each registration.</p>
          </div>
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!error && !registrations && <Card><LoadingSpinner label="Loading registrations" /></Card>}

        {registrations?.length === 0 && (
          <Card className="empty-state">
            <h2>No registrations</h2>
            <p>Open an event from <Link to="/requests">Events open to you</Link> to register.</p>
          </Card>
        )}

        {registrations?.length > 0 && (
          <ul className="request-list" aria-label="My registrations">
            {registrations.map((registration) => (
              <li key={registration.eventRequestId}>
                <Card className="request-item">
                  <div className="request-item-main">
                    <h2>{registration.eventTitle ?? 'Untitled event'}</h2>
                    <p className="request-meta">
                      {[displayDateTime(registration.eventStartsAt), venueText(registration.venueNames)].filter(Boolean).join(' · ')}
                    </p>
                    <p>Status: <strong>{registrationStatusLabel(registration.status, registration.waitingListPosition)}</strong></p>
                    {eventStatusNote(registration.eventStatus) && <p className="form-note"><strong>{eventStatusNote(registration.eventStatus)}</strong></p>}
                  </div>
                  {/* SPM-41: Attendees can open only Confirmed and Preparation events (SPM-42 scope). */}
                  {registrationEligibleStatus(registration.eventStatus) && (
                    <div className="request-item-actions">
                      <Link className="button button-secondary button-small" to={`/requests/${registration.eventRequestId}`}>View event</Link>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default MyRegistrationsPage
