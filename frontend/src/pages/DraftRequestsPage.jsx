import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DRAFT } from '../../../shared/status.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listRequests } from '../services/api.js'

// SPM-24 — saved drafts on a dedicated page, separate from the page listing submitted requests
// (team decision: a page rather than a combined list).
//
// The list keeps only `status === DRAFT`, and never enumerates the submitted-side statuses, whose
// name the team has not ratified. No owner check is made here: the API returns a draft only to its
// owner (shared/permissions.js), which is also SPM-24's last criterion — a draft is invisible to
// everyone else, coordinators and same-organisation colleagues included.

function draftTitle(request) {
  const title = request.core?.title
  return typeof title === 'string' && title.trim() !== '' ? title : 'Untitled draft'
}

// A draft may be incomplete (Clarification 2, Drafts), so every field can be missing.
function preferredDate(request) {
  const value = request.core?.preferredDateTime
  if (!value) return 'No preferred date yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No preferred date yet'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function DraftRequestsPage() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    async function loadDrafts() {
      try {
        const { requests } = await listRequests(user)
        if (active) setDrafts(requests.filter((request) => request.status === DRAFT))
      } catch (requestError) {
        if (active) setError(requestError.status === 401 ? 'Your session has expired. Please log in again.' : 'We could not load your drafts. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDrafts()
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
            <h1>Saved drafts</h1>
            <p>Unsubmitted requests, visible only to you. Submitted requests are listed separately.</p>
          </div>
          <Link className="button button-primary button-small" to="/event-requests/new">New request</Link>
        </div>

        {loading && <Card><LoadingSpinner label="Loading your drafts" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && drafts.length === 0 && (
          <Card className="empty-state">
            <h2>You have no saved drafts</h2>
            <p>Requests you save without submitting will appear here, ready to finish later.</p>
            <Link className="button button-primary" to="/event-requests/new">Create an event request</Link>
          </Card>
        )}

        {!loading && !error && drafts.length > 0 && (
          <ul className="request-list">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Card className="request-item">
                  <div className="request-item-main">
                    <h2>{draftTitle(draft)}</h2>
                    <p className="request-meta">{preferredDate(draft)}</p>
                  </div>
                  <Link className="button button-secondary button-small" to={`/event-requests/${draft.id}/edit`}>
                    Continue editing
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default DraftRequestsPage
