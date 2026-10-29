import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { assignCoordinator, getAssignmentCandidates, listUnassignedRequests } from '../services/api.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Navbar from '../components/Navbar.jsx'

// SPM-68 — the Event Coordinator Lead's unassigned queue: submitted requests waiting for an Event Coordinator,
// oldest first, with basic event information. The Lead picks a Coordinator (each shown with their active
// events; nothing is pre-selected) and confirms. The API decides who may see the queue, who may be chosen and
// whether the request is still unassigned; this page only presents it.

const LOAD_ERROR = 'Unable to load the unassigned requests.'
const CANDIDATES_ERROR = 'We could not load the list of Coordinators. Please try again.'
const ASSIGN_ERROR = 'We could not assign this request. Please try again.'

const displayTime = (value) =>
  !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const displayValue = (value, suffix = '') => (value === null || value === undefined || value === '' ? 'Not set' : `${value}${suffix}`)

const activeEventsLabel = (count) => `${count} active event${count === 1 ? '' : 's'}`

function Row({ label, children }) {
  return <div className="profile-row booking-row"><span>{label}</span><strong>{children}</strong></div>
}

function AssignControl({ user, request, onAssigned, onStale }) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [coordinatorUid, setCoordinatorUid] = useState('')
  const selectId = `assign-coordinator-${request.id}`

  async function start() {
    setOpen(true)
    setError(null)
    setCoordinatorUid('')
    setLoading(true)
    try {
      setCandidates((await getAssignmentCandidates(user, request.id)).candidates ?? [])
    } catch (loadError) {
      setCandidates(null)
      if (loadError.status === 409 || loadError.status === 404) return onStale(loadError.details?.message)
      setError(loadError.details?.message ?? CANDIDATES_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    setSaving(true)
    setError(null)
    try {
      const response = await assignCoordinator(user, request.id, { coordinatorUid })
      const chosen = candidates.find((candidate) => candidate.uid === coordinatorUid)
      onAssigned(request, response.coordinator?.name ?? chosen?.name ?? 'the chosen Coordinator')
    } catch (saveError) {
      setSaving(false)
      // Another Lead assigned it first, or it is gone: the list is out of date.
      if (saveError.status === 409 || saveError.status === 404) return onStale(saveError.details?.message)
      setError(saveError.details?.message ?? ASSIGN_ERROR)
    }
  }

  if (!open) {
    return (
      <div className="booking-actions">
        <Button type="button" variant="secondary" className="button-small" onClick={start}>Assign</Button>
      </div>
    )
  }

  return (
    <div role="group" aria-label={`Assign a Coordinator to ${request.title || 'this request'}`}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {loading && <p className="form-note">Loading Coordinators…</p>}
      {!loading && candidates?.length === 0 && <p className="form-note">No Event Coordinator is available for this request.</p>}
      {!loading && candidates?.length > 0 && (
        <div className="field">
          <label htmlFor={selectId}>Event Coordinator</label>
          <select id={selectId} value={coordinatorUid} disabled={saving} onChange={(event) => setCoordinatorUid(event.target.value)}>
            <option value="">Choose a Coordinator</option>
            {candidates.map((candidate) => (
              <option key={candidate.uid} value={candidate.uid}>{`${candidate.name} · ${activeEventsLabel(candidate.activeEvents)}`}</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-actions" style={{ gap: 12 }}>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
        {candidates?.length > 0 && (
          <Button type="button" disabled={saving || coordinatorUid === ''} onClick={confirm}>
            {saving ? 'Assigning…' : 'Confirm assignment'}
          </Button>
        )}
      </div>
    </div>
  )
}

function QueueCard({ user, request, onAssigned, onStale }) {
  return (
    <Card className="request-form-section booking-card">
      <div className="section-heading"><h3>{request.title || 'Untitled event'}</h3></div>
      <Row label="Date and time">{displayTime(request.preferredDateTime)}</Row>
      <Row label="Duration">{displayValue(request.durationHours, ' hours')}</Row>
      <Row label="Expected attendees">{displayValue(request.expectedAttendees)}</Row>
      <Row label="Organisation">{displayValue(request.organisationName)}</Row>
      <Row label="Submitted">{displayTime(request.submittedAt)}</Row>
      <div className="booking-actions">
        <Link className="button button-secondary button-small" to={`/requests/${request.id}`}>View</Link>
      </div>
      <AssignControl user={user} request={request} onAssigned={onAssigned} onStale={onStale} />
    </Card>
  )
}

export default function UnassignedRequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRequests((await listUnassignedRequests(user)).requests)
    } catch (failure) {
      setError(failure?.details?.message ?? LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const assigned = useCallback((request, name) => {
    setRequests((current) => (current ?? []).filter((item) => item.id !== request.id))
    setNotice(`“${request.title || 'Untitled event'}” was assigned to ${name}.`)
  }, [])

  const stale = useCallback((message) => {
    setNotice(`${message ?? 'This request is no longer waiting for a Coordinator.'} The list has been refreshed.`)
    load()
  }, [load])

  return (
    <div className="booking-shell">
      <Navbar />
      <main className="container page-shell booking-page">
        <div className="page-heading">
          <div>
            <h1>Unassigned requests</h1>
            <p>Submitted requests waiting for an Event Coordinator, oldest first.</p>
          </div>
          <Button type="button" variant="secondary" disabled={loading} onClick={load}>Refresh</Button>
        </div>
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {!requests && <Button type="button" variant="secondary" onClick={load}>Try again</Button>}
          </div>
        )}
        {loading && !requests && <p role="status">Loading unassigned requests...</p>}
        {requests?.length === 0 && <Card className="request-form-section"><p>No requests are waiting for a Coordinator.</p></Card>}
        {requests?.length > 0 && (
          <section aria-label="Unassigned requests">
            {requests.map((request) => (
              <QueueCard key={request.id} user={user} request={request} onAssigned={assigned} onStale={stale} />
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
