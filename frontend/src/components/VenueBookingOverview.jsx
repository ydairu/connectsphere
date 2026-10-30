import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BOOKING_APPROVED, currentVenueBookingGroups, venueBookingLabel, venueBookingNextStep, venueBookingStatusLabel } from '../../../shared/venueBooking.js'
import { getVenueBookings, setPrimaryVenue } from '../services/api.js'
import Card from './Card.jsx'

const displayTime = (value) => !value || Number.isNaN(Date.parse(value)) ? 'Not set'
  : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function VenueBookingOverview({ user, eventId, eventStatus, canManage, canSetPrimary = false, primaryVenue = null, onPrimaryChanged }) {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [selectingId, setSelectingId] = useState(null)
  const [selectionError, setSelectionError] = useState(null)

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
  async function choosePrimary(bookingId) {
    setSelectingId(bookingId)
    setSelectionError(null)
    try {
      await setPrimaryVenue(user, eventId, bookingId, primaryVenue?.bookingId ?? null)
    } catch (error) {
      if (error.status === 409) {
        try { await onPrimaryChanged?.() } catch { /* The page can still be refreshed manually. */ }
      }
      setSelectionError(error.status === 409 ? `${error.details?.message ?? 'The venue changed.'} Review the latest event and try again.`
        : error.details?.message ?? 'The primary venue could not be saved.')
      setSelectingId(null)
      return
    }
    try {
      await onPrimaryChanged?.()
    } catch {
      setSelectionError('The primary venue was saved, but the event could not be refreshed. Reload the page to see it.')
    } finally {
      setSelectingId(null)
    }
  }
  return <Card className="request-form-section">
    <div className="section-heading"><h2>Venue bookings</h2>
      <button type="button" className="button button-secondary button-small" onClick={() => setReload((value) => value + 1)}>Refresh</button>
    </div>
    {bookings === null && !error && <p role="status">Loading venue bookings…</p>}
    {error && <p role="alert">Venue bookings could not be loaded. Try Refresh.</p>}
    {selectionError && <p role="alert">{selectionError}</p>}
    {bookings?.length === 0 && <p>No venue bookings yet.</p>}
    {groups.map(({ venueNeedId, current, history }) => <section className="venue-booking-overview-item" key={venueNeedId} role="region" aria-label={`Booking for ${current.venueName}, ${displayTime(current.startsAt)}`}>
      <h3>{current.venueName} {primaryVenue?.bookingId === current.id && <span className="significant-badge">Primary venue</span>}</h3>
      <p><strong>{venueBookingLabel(current)}</strong> · {displayTime(current.startsAt)}–{displayTime(current.endsAt)}</p>
      <p>Next step: {venueBookingNextStep(current, eventStatus)}</p>
      {canManage && <Link to={`/requests/${eventId}/venue-bookings?bookingId=${encodeURIComponent(current.id)}`}>Manage this booking</Link>}
      {canSetPrimary && current.status === BOOKING_APPROVED && primaryVenue?.bookingId !== current.id &&
        <button type="button" className="button button-secondary button-small" disabled={selectingId !== null}
          onClick={() => choosePrimary(current.id)}>Set as primary venue</button>}
      {history.length > 0 && <details><summary>Previous requests ({history.length})</summary>
        <ul>{history.map((attempt) => <li key={attempt.id}>{attempt.venueName} · {venueBookingStatusLabel(attempt.status)} · {displayTime(attempt.startsAt)}–{displayTime(attempt.endsAt)}</li>)}</ul>
      </details>}
    </section>)}
  </Card>
}
