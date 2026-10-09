import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listVenues } from '../services/api.js'

function InlineList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return <span>Not recorded</span>
  return <span>{items.join(', ')}</span>
}

function TextValue({ children }) {
  if (children === undefined || children === null || children === '') return <span>Not recorded</span>
  return <span>{children}</span>
}

function VenueCataloguePage() {
  const { user, roles } = useAuth()
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canAddVenue = roles.includes(VENUE_STAFF)

  useEffect(() => {
    let active = true

    async function loadVenues() {
      try {
        const response = await listVenues(user)
        if (active) setVenues(response.venues)
      } catch (venueError) {
        if (!active) return
        if (venueError.status === 401) setError('Your session has expired. Please log in again.')
        else if (venueError.status === 403) setError('You do not have access to the venue catalogue.')
        else setError('We could not load the venue catalogue. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadVenues()
    return () => {
      active = false
    }
  }, [user])

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Venue catalogue</span>
            <h1>Available venues</h1>
            <p>View location, capacity, facilities, accessibility, layouts, and operating hours for each venue.</p>
          </div>
          {canAddVenue && <Link className="button button-secondary button-small" to="/venues/new">Add venue</Link>}
        </div>

        {loading && <Card><LoadingSpinner label="Loading venues" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && venues.length === 0 && (
          <Card className="empty-state">
            <h2>No venues yet</h2>
            <p>Add the first venue so the catalogue can be used for planning and availability workflows.</p>
            {canAddVenue && <Link className="button button-primary" to="/venues/new">Add venue</Link>}
          </Card>
        )}

        {!loading && !error && venues.length > 0 && (
          <ul className="venue-list">
            {venues.map((venue) => (
              <li key={venue.id}>
                <Card className="venue-card">
                  <div className="venue-card-main">
                    <h2>{venue.name}</h2>
                    <p className="request-meta"><TextValue>{venue.location}</TextValue></p>
                    <dl className="venue-summary-grid">
                      <div>
                        <dt>Capacity</dt>
                        <dd><TextValue>{venue.maximumCapacity}</TextValue></dd>
                      </div>
                      <div>
                        <dt>Layouts</dt>
                        <dd><InlineList items={venue.supportedLayouts} /></dd>
                      </div>
                      <div>
                        <dt>Facilities</dt>
                        <dd><InlineList items={venue.facilities} /></dd>
                      </div>
                      <div>
                        <dt>Accessibility</dt>
                        <dd><InlineList items={venue.accessibilityFeatures} /></dd>
                      </div>
                    </dl>
                    <p className="venue-hours">Operating hours: <TextValue>{venue.operatingHours}</TextValue></p>
                  </div>
                  <div className="request-item-actions">
                    <Link className="button button-secondary button-small" to={`/venues/${venue.id}`}>View details</Link>
                    <Link className="button button-secondary button-small" to={`/venues/${venue.id}/availability`}>View availability</Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default VenueCataloguePage
