import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORGANISER } from '../../../shared/permissions.js'
import { DRAFT } from '../../../shared/status.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import StatusPill from '../components/StatusPill.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listRequests } from '../services/api.js'

// SPM-24 — submitted requests are shown with their current status and are not editable as drafts.
// SPM-42 — the same page serves every role: the API returns only the records in the caller's scope,
// already reduced to the sections their roles may view, so nothing is filtered by role here.
//
// Drafts are excluded because they have their own page. Only `status === DRAFT` is tested; the
// submitted-side status names are never enumerated.

function requestTitle(request) {
  const title = request.core?.title
  return typeof title === 'string' && title.trim() !== '' ? title : 'Untitled request'
}

function requestDate(request) {
  const value = request.core?.preferredDateTime
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function RequestsPage() {
  const { user, roles } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isOrganiser = roles.includes(ORGANISER)

  useEffect(() => {
    let active = true

    async function loadRequests() {
      try {
        const response = await listRequests(user)
        if (active) setRequests(response.requests.filter((request) => request.status !== DRAFT))
      } catch (requestError) {
        if (active) setError(requestError.status === 401 ? 'Your session has expired. Please log in again.' : 'We could not load these requests. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadRequests()
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
            <span className="eyebrow">Your requests</span>
            <h1>Event requests</h1>
            <p>Requests you have access to, with their current status. These are not editable as drafts.</p>
          </div>
          {isOrganiser && <Link className="button button-secondary button-small" to="/requests/drafts">Saved drafts</Link>}
        </div>

        {loading && <Card><LoadingSpinner label="Loading requests" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && requests.length === 0 && (
          <Card className="empty-state">
            <h2>No requests to show</h2>
            <p>Requests appear here once they are submitted and you have access to them.</p>
            {isOrganiser && <Link className="button button-primary" to="/requests/drafts">Go to your drafts</Link>}
          </Card>
        )}

        {!loading && !error && requests.length > 0 && (
          <ul className="request-list">
            {requests.map((request) => {
              const date = requestDate(request)
              return (
                <li key={request.id}>
                  <Card className="request-item">
                    <div className="request-item-main">
                      <h2>{requestTitle(request)}</h2>
                      <p className="request-meta">
                        {[request.organisationName, date].filter(Boolean).join(' · ') || 'No preferred date yet'}
                      </p>
                    </div>
                    <StatusPill status={request.status} />
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

export default RequestsPage
