import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ORGANISER } from '../../../shared/permissions.js'
import { DRAFT } from '../../../shared/status.js'
import { TERMINAL_STATUSES } from '../../../shared/statusTransitions.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import StatusPill from '../components/StatusPill.jsx'
import SafetyStatusPill from '../components/SafetyStatusPill.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { listRequests } from '../services/api.js'
import { requestListCopy } from '../utils/requestListCopy.js'

// SPM-24 — submitted requests are shown with their current status and are not editable as drafts.
// SPM-42 — the same page serves every role: the API returns only the records in the caller's scope,
// already reduced to the sections their roles may view, so nothing is filtered by role here. Roles
// change only the wording (requestListCopy), never the data or the code path.
//
// Drafts are excluded because they have their own page. Only `status === DRAFT` is tested; the
// submitted-side status names are never enumerated.
//
// SPM-26: a page that sends the user here after an action may pass `state.notice`, shown at the top.
// SPM-63 — a Cancelled event "is not in the active events list". Completed, Cancelled and Rejected events
// (TERMINAL_STATUSES) are listed separately under "Closed events", so they stay reachable.
//
// SPM-64 follow-up — an Organiser sees who submitted each request ("You", or the colleague's name, from
// ownerName / isOwnRequest in the API response) and can narrow the list to their own requests. The filter
// runs over what the API already returned; it changes nothing about which requests the Organiser may see.
// Other roles receive neither field and get neither the label nor the filter.
//
// SPM-91: an event's safety review status (safetyReviewStatus, sent only to users who may see it) is shown
// beside its lifecycle status, e.g. "Pending safety check" on a Planning event. SPM-66: a Safety Officer's
// list is the safety-review queue, because their scope holds only queued events.

const ALL = 'all'
const MINE = 'mine'

function submittedBy(request) {
  if (request.isOwnRequest === true) return 'You'
  if (request.isOwnRequest === false) return request.ownerName ?? 'A colleague'
  return null
}

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

function RequestList({ requests, showOwner }) {
  return (
    <ul className="request-list">
      {requests.map((request) => {
        const date = requestDate(request)
        const owner = showOwner ? submittedBy(request) : null
        return (
          <li key={request.id}>
            <Card className="request-item">
              <div className="request-item-main">
                <h2>{requestTitle(request)}</h2>
                <p className="request-meta">
                  {[request.organisationName, date].filter(Boolean).join(' · ') || 'No preferred date yet'}
                </p>
                {owner && <p className="request-meta">Submitted by: {owner}</p>}
              </div>
              <div className="request-item-actions">
                <SafetyStatusPill status={request.safetyReviewStatus} />
                <StatusPill status={request.status} />
                <Link className="button button-secondary button-small" to={`/requests/${request.id}`}>View</Link>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

function RequestsPage() {
  const { user, roles } = useAuth()
  const notice = useLocation().state?.notice
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [show, setShow] = useState(ALL)
  const isOrganiser = roles.includes(ORGANISER)
  const copy = requestListCopy(roles)
  const shown = isOrganiser && show === MINE ? requests.filter((request) => request.isOwnRequest === true) : requests
  const activeRequests = shown.filter((request) => !TERMINAL_STATUSES.includes(request.status))
  const closedRequests = shown.filter((request) => TERMINAL_STATUSES.includes(request.status))

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
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          {isOrganiser && <Link className="button button-secondary button-small" to="/requests/drafts">Saved drafts</Link>}
        </div>

        {typeof notice === 'string' && <div className="alert alert-success" role="status">{notice}</div>}

        {loading && <Card><LoadingSpinner label="Loading requests" /></Card>}

        {!loading && error && <div className="alert alert-error" role="alert">{error}</div>}

        {!loading && !error && requests.length === 0 && (
          <Card className="empty-state">
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyBody}</p>
            {isOrganiser && <Link className="button button-primary" to="/requests/drafts">Go to your drafts</Link>}
          </Card>
        )}

        {!loading && !error && isOrganiser && requests.length > 0 && (
          <fieldset className="role-selector" style={{ maxWidth: 420 }}>
            <legend>Show</legend>
            {[[ALL, 'All'], [MINE, 'My requests']].map(([value, label]) => (
              <label key={value} className={`role-option${show === value ? ' selected' : ''}`}>
                <input type="radio" name="request-owner-filter" value={value} checked={show === value} onChange={() => setShow(value)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {!loading && !error && requests.length > 0 && shown.length === 0 && (
          <Card className="empty-state">
            <p>You haven't submitted any requests yet.</p>
          </Card>
        )}

        {!loading && !error && activeRequests.length > 0 && <RequestList requests={activeRequests} showOwner={isOrganiser} />}

        {!loading && !error && closedRequests.length > 0 && (
          <section aria-labelledby="closed-requests-heading">
            <div className="section-heading">
              <h2 id="closed-requests-heading">Closed events</h2>
            </div>
            <RequestList requests={closedRequests} showOwner={isOrganiser} />
          </section>
        )}
      </main>
    </div>
  )
}

export default RequestsPage
