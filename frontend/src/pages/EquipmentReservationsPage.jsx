import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RESERVATION_STATUS, RESERVATION_STATUS_LABELS } from '../../../shared/equipmentReservation.js'
import { useAuth } from '../hooks/useAuth.js'
import { listEquipmentReservations } from '../services/api.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'

// SPM-58 — the equipment reservations of the events assigned to the signed-in Technical Support Staff member:
// which event each is for, its date and time, the type, quantity and units, and whether it is Active or
// Released. Reached from the Equipment page, not the navbar (team decision, 19 Oct 2026).

const FILTERS = Object.freeze([
  { value: '', label: 'All' },
  { value: RESERVATION_STATUS.ACTIVE, label: RESERVATION_STATUS_LABELS[RESERVATION_STATUS.ACTIVE] },
  { value: RESERVATION_STATUS.RELEASED, label: RESERVATION_STATUS_LABELS[RESERVATION_STATUS.RELEASED] },
])

const displayTime = (value) =>
  !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Row({ label, children }) {
  return <div className="profile-row booking-row"><span>{label}</span><strong>{children}</strong></div>
}

function ReservationCard({ reservation }) {
  return (
    <section aria-label={`Reservation for ${reservation.eventTitle || 'Untitled event'}`}>
      <Card className="request-form-section booking-card">
        <div className="section-heading">
          <h3>{reservation.eventTitle || 'Untitled event'}</h3>
          <span className={`status-pill reservation-status-${reservation.status}`}>{RESERVATION_STATUS_LABELS[reservation.status] ?? reservation.status}</span>
        </div>
        <Row label="Event date and time">{`${displayTime(reservation.startsAt)} – ${displayTime(reservation.endsAt)}`}</Row>
        <Row label="Equipment">{`${reservation.quantity} × ${reservation.equipmentTypeName ?? reservation.equipmentTypeId}`}</Row>
        {reservation.assetTags.length > 0 && <Row label="Units">{reservation.assetTags.join(', ')}</Row>}
        <Row label="Reserved">{`${displayTime(reservation.reservedAt)}${reservation.reservedByName ? ` by ${reservation.reservedByName}` : ''}`}</Row>
        {reservation.releasedAt && <Row label="Released">{displayTime(reservation.releasedAt)}</Row>}
        <div className="booking-actions">
          <Link className="button button-secondary button-small" to={`/requests/${reservation.eventRequestId}?tab=equipment-required`}>Open event</Link>
        </div>
      </Card>
    </section>
  )
}

export default function EquipmentReservationsPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [reservations, setReservations] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    setReservations(null)
    try {
      setReservations((await listEquipmentReservations(user, { status })).reservations)
    } catch (failure) {
      setError(failure?.status === 403 ? 'Only Technical Support Staff can view equipment reservations.' : 'Equipment reservations could not be loaded.')
    }
  }, [user, status])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container venue-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow"><Link to="/equipment">Equipment availability</Link></span>
            <h1>Equipment reservations</h1>
            <p>Reservations for the events assigned to you: which event each is for, when, and whether it is still active.</p>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="reservation-status">Show</label>
          <select id="reservation-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error} <Button type="button" variant="secondary" onClick={load}>Try again</Button>
          </div>
        )}
        {!error && reservations === null && <Card><LoadingSpinner label="Loading reservations" /></Card>}
        {!error && reservations?.length === 0 && (
          <Card className="empty-state">
            <h2>No reservations</h2>
            <p>No equipment is reserved for the events assigned to you{status ? ' with this status' : ''}.</p>
          </Card>
        )}
        {reservations?.length > 0 && (
          <ul className="request-list" aria-label="Equipment reservations">
            {reservations.map((reservation) => <li key={reservation.id}><ReservationCard reservation={reservation} /></li>)}
          </ul>
        )}
      </main>
    </div>
  )
}
