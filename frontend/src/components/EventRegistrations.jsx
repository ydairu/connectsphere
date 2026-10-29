import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import { listEventRegistrations } from '../services/api.js'
import { displayDateTime, registrationStatusLabel } from '../utils/registration.js'

// SPM-19 — the event's registered Attendees, for the owning Organiser and the assigned Coordinator
// (canViewRegistrations in the request response). The list comes from GET /api/requests/:id/registrations,
// which refuses everyone else, so this card is shown only when the response says the user may read it.

function EventRegistrations({ user, requestId, canView }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!canView) return undefined
    let active = true
    listEventRegistrations(user, requestId)
      .then((response) => { if (active) setData(response) })
      .catch(() => { if (active) setError('We could not load the registrations. Please try again.') })
    return () => { active = false }
  }, [user, requestId, canView])

  if (!canView) return null

  return (
    <section aria-label="Registrations">
      <Card className="request-form-section">
        <div className="section-heading"><h2>Registrations</h2></div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!error && !data && <LoadingSpinner label="Loading registrations" />}
        {data && (
          <>
            <p>
              <strong>{data.registeredCount}</strong> registered
              {data.capacity != null && <> of <strong>{data.capacity}</strong> places</>}
            </p>
            {data.registrations.length === 0 ? (
              <p className="form-note">No one has registered yet.</p>
            ) : (
              <ul className="value-list" aria-label="Registered attendees">
                {data.registrations.map((registration) => (
                  <li key={`${registration.email}-${registration.registeredAt}`}>
                    <strong>{registration.name ?? 'Name not given'}</strong>
                    {[registration.email, registrationStatusLabel(registration.status), displayDateTime(registration.registeredAt)]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join('')}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </section>
  )
}

export default EventRegistrations
