import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getVenue } from '../services/api.js'

function ListValue({ items }) {
  if (!Array.isArray(items) || items.length === 0) return <strong className="value-empty">Not set</strong>
  return <ul className="value-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
}

function DetailRow({ label, children }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      {children}
    </div>
  )
}

function VenueDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const [venue, setVenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let active = true

    async function loadVenue() {
      try {
        const response = await getVenue(user, id)
        if (active) setVenue(response.venue)
      } catch (error) {
        if (!active) return
        if (error.status === 403) setLoadError('You do not have access to this venue.')
        else if (error.status === 404) setLoadError('This venue no longer exists.')
        else if (error.status === 401) setLoadError('Your session has expired. Please log in again.')
        else setLoadError('We could not load this venue. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadVenue()
    return () => {
      active = false
    }
  }, [id, user])

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container venue-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow"><Link to="/venues/new">Add another venue</Link></span>
            <h1>{venue?.name || (loading ? 'Loading venue...' : 'Venue details')}</h1>
            {venue && <p>Catalogue reference {venue.id}</p>}
          </div>
        </div>

        {location.state?.created && <div className="alert alert-success" role="status">Venue added to the catalogue.</div>}
        {loading && <Card><LoadingSpinner label="Loading venue" /></Card>}
        {!loading && loadError && <div className="alert alert-error" role="alert">{loadError}</div>}

        {!loading && !loadError && venue && (
          <Card className="request-form-section">
            <h2>Saved venue information</h2>
            <DetailRow label="Physical location"><strong>{venue.location}</strong></DetailRow>
            <DetailRow label="Maximum capacity"><strong>{venue.maximumCapacity}</strong></DetailRow>
            <DetailRow label="Facilities"><ListValue items={venue.facilities} /></DetailRow>
            <DetailRow label="Accessibility features"><ListValue items={venue.accessibilityFeatures} /></DetailRow>
            <DetailRow label="Supported room layouts"><ListValue items={venue.supportedLayouts} /></DetailRow>
            <DetailRow label="Operating hours"><strong>{venue.operatingHours}</strong></DetailRow>
            <DetailRow label="Added by"><strong>{venue.createdByName || venue.createdByUid || 'Venue Staff'}</strong></DetailRow>
          </Card>
        )}
      </main>
    </div>
  )
}

export default VenueDetailPage
