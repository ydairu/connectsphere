import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EQUIPMENT_REQUEST_STATUS_LABELS } from '../../../shared/equipmentRequest.js'
import { useAuth } from '../hooks/useAuth.js'
import { listAssignedEquipmentRequests } from '../services/api.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Navbar from '../components/Navbar.jsx'

// SPM-56 — the equipment requests assigned to the signed-in Technical Support Staff member, waiting for review
// first, oldest first. Follows SPM-53's Venue Staff queue. Each request is reviewed on its event's page
// (Equipment requests card), so approving — and SPM-36's rejecting — happens in one place.

const displayTime = (value) =>
  !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Row({ label, children }) {
  return <div className="profile-row booking-row"><span>{label}</span><strong>{children}</strong></div>
}

export default function EquipmentRequestQueuePage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRequests((await listAssignedEquipmentRequests(user)).requests)
    } catch (failure) {
      setError(failure?.details?.message ?? 'Unable to load your equipment requests.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="booking-shell">
      <Navbar />
      <main className="container page-shell booking-page">
        <div className="page-heading">
          <div>
            <h1>Equipment requests</h1>
            <p>Requests assigned to you. Those waiting for review come first, oldest first.</p>
          </div>
          <Button type="button" variant="secondary" disabled={loading} onClick={load}>Refresh</Button>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {!requests && <Button type="button" variant="secondary" onClick={load}>Try again</Button>}
          </div>
        )}
        {loading && <p role="status">Loading equipment requests...</p>}
        {requests?.length === 0 && <Card className="request-form-section"><p>No equipment requests are assigned to you.</p></Card>}
        {requests?.map((request) => (
          <Card className="request-form-section booking-card" key={request.id}>
            <div className="section-heading"><h2>{request.eventTitle || 'Untitled event'}</h2></div>
            <Row label="Status">{EQUIPMENT_REQUEST_STATUS_LABELS[request.status] ?? request.status}</Row>
            <Row label="Required from">{displayTime(request.requiredPeriod?.startsAt)}</Row>
            <Row label="Required until">{displayTime(request.requiredPeriod?.endsAt)}</Row>
            <Row label="Equipment">{request.items.map((item) => `${item.quantity} × ${item.equipmentTypeName}`).join(', ')}</Row>
            <Row label="Submitted">{displayTime(request.createdAt)}</Row>
            {request.approvedAt && <Row label="Approved on">{displayTime(request.approvedAt)}</Row>}
            <div className="booking-actions">
              <Link className="button button-secondary button-small" to={`/requests/${request.eventRequestId}#equipment-requests`}>Review on event</Link>
            </div>
          </Card>
        ))}
      </main>
    </div>
  )
}
