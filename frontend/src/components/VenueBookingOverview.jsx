import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentVenueBookingGroups, venueBookingNextStep, venueBookingStatusLabel } from '../../../shared/venueBooking.js'
import { getVenueBookings } from '../services/api.js'
import Card from './Card.jsx'

const displayTime = (value) => !value || Number.isNaN(Date.parse(value)) ? 'Not set'
  : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function VenueBookingOverview({ user, eventId, eventStatus, canManage }) {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setBookings(null)
    setError(false)
    getVenueBookings(user, eventId).then((response) => {
      if (active) setBookings(response.bookings)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [user, eventId, reload])

  const groups = currentVenueBookingGroups(bookings ?? [])
  return <Card className="request-form-section">
    <div className="section-heading"><h2>Venue bookings</h2>
      <button type="button" className="button button-secondary button-small" onClick={() => setReload((value) => value + 1)}>Refresh</button>
    </div>
    {bookings === null && !error && <p role="status">Loading venue bookings…</p>}
    {error && <p role="alert">Venue bookings could not be loaded. Try Refresh.</p>}
    {bookings?.length === 0 && <p>No venue bookings yet.</p>}
    {groups.map(({ venueNeedId, current, history }) => <section className="venue-booking-overview-item" key={venueNeedId} role="region" aria-label={`Booking for ${current.venueName}, ${displayTime(current.startsAt)}`}>
      <h3>{current.venueName}</h3>
      <p><strong>{venueBookingStatusLabel(current.status)}</strong> · {displayTime(current.startsAt)}–{displayTime(current.endsAt)}</p>
      <p>Next step: {venueBookingNextStep(current, eventStatus)}</p>
      {canManage && <Link to={`/requests/${eventId}/venue-bookings?bookingId=${encodeURIComponent(current.id)}`}>Manage this booking</Link>}
      {history.length > 0 && <details><summary>Previous requests ({history.length})</summary>
        <ul>{history.map((attempt) => <li key={attempt.id}>{attempt.venueName} · {venueBookingStatusLabel(attempt.status)} · {displayTime(attempt.startsAt)}–{displayTime(attempt.endsAt)}</li>)}</ul>
      </details>}
    </section>)}
  </Card>
}
