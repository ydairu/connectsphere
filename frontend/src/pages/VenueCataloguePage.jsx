import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listVenues } from '../services/api.js'

function localDateTimeValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function defaultAvailabilitySearch() {
  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const end = new Date(start)
  end.setHours(18, 0, 0, 0)
  return {
    availableFrom: localDateTimeValue(start),
    availableTo: localDateTimeValue(end),
  }
}

function toApiDateTime(value) {
  return new Date(value).toISOString()
}

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
  const [availabilitySearch, setAvailabilitySearch] = useState(defaultAvailabilitySearch)
  const [activeAvailabilitySearch, setActiveAvailabilitySearch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canAddVenue = roles.includes(VENUE_STAFF)

  useEffect(() => {
    let active = true

    async function loadVenues() {
      try {
        const response = activeAvailabilitySearch ? await listVenues(user, activeAvailabilitySearch) : await listVenues(user)
        if (active) setVenues(response.venues)
      } catch (venueError) {
        if (!active) return
        if (venueError.status === 401) setError('Your session has expired. Please log in again.')
        else if (venueError.status === 403) setError('You do not have access to the venue catalogue.')
        else if (venueError.status === 400) setError('Choose a valid availability period where the end is after the start.')
        else setError('We could not load the venue catalogue. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadVenues()
    return () => {
      active = false
    }
  }, [activeAvailabilitySearch, user])

  function updateAvailabilitySearch(field, value) {
    setAvailabilitySearch((current) => ({ ...current, [field]: value }))
  }

  function searchAvailableVenues(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setActiveAvailabilitySearch({
      availableFrom: toApiDateTime(availabilitySearch.availableFrom),
      availableTo: toApiDateTime(availabilitySearch.availableTo),
    })
  }

  function clearAvailabilitySearch() {
    setLoading(true)
    setError(null)
    setActiveAvailabilitySearch(null)
  }

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

        <Card className="request-form-section availability-controls">
          <h2>Search by availability</h2>
          <p className="request-meta">Filter out venues that already have bookings, tentative holds, or maintenance blocks in the selected period.</p>
          <form onSubmit={searchAvailableVenues}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="availableFrom">Available from</label>
                <input
                  id="availableFrom"
                  type="datetime-local"
                  value={availabilitySearch.availableFrom}
                  onChange={(event) => updateAvailabilitySearch('availableFrom', event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="availableTo">Available to</label>
                <input
                  id="availableTo"
                  type="datetime-local"
                  value={availabilitySearch.availableTo}
                  onChange={(event) => updateAvailabilitySearch('availableTo', event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-actions">
              {activeAvailabilitySearch && (
                <button className="button button-secondary" type="button" onClick={clearAvailabilitySearch}>
                  Clear availability search
                </button>
              )}
              <button className="button button-primary" type="submit">Search available venues</button>
            </div>
          </form>
        </Card>

        {loading && <Card><LoadingSpinner label="Loading venues" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && venues.length === 0 && (
          <Card className="empty-state">
            <h2>{activeAvailabilitySearch ? 'No venues available' : 'No venues yet'}</h2>
            <p>
              {activeAvailabilitySearch
                ? 'No catalogue venues are available for the selected period.'
                : 'Add the first venue so the catalogue can be used for planning and availability workflows.'}
            </p>
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
