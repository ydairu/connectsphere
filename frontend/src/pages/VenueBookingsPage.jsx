import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BOOKING_PENDING, BOOKING_REJECTED, capacityWarning } from '../../../shared/venueBooking.js'
import { getVenueBookings, getVenueBookingQueue, listVenues, submitVenueBooking } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import Navbar from '../components/Navbar.jsx'
import Card from '../components/Card.jsx'

function localTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const displayTime = (value) => new Date(value).toLocaleString()
const emptyForm = () => ({ venueId: '', startsAt: '', endsAt: '', requirements: '', specialRequests: '', replacesId: null, submissionKey: crypto.randomUUID() })

export default function VenueBookingsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [venues, setVenues] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = id ? await getVenueBookings(user, id) : await getVenueBookingQueue(user)
        const catalogue = response.canSubmit ? await listVenues(user) : { venues: [] }
        if (!active) return
        setData(response)
        setVenues(catalogue.venues)
        const core = response.event?.core
        if (core) setForm({ ...emptyForm(), startsAt: localTime(core.preferredDateTime),
          endsAt: core.preferredDateTime && core.durationHours ? localTime(new Date(Date.parse(core.preferredDateTime) + core.durationHours * 3600000).toISOString()) : '',
          requirements: [response.event?.venue?.layoutPreference, response.event?.venue?.accessibilityNeeds].filter(Boolean).join('\n') })
      } catch (err) { if (active) setError(err.details?.message ?? 'Unable to load booking requests.') }
    }
    load()
    return () => { active = false }
  }, [id, user])
  const selected = venues.find((v) => v.id === form.venueId)
  const warning = selected ? capacityWarning(data?.event?.core?.expectedAttendees, selected.maximumCapacity) : null
  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await submitVenueBooking(user, id, { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() })
      const response = await getVenueBookings(user, id)
      setData(response)
      setForm({ ...form, submissionKey: crypto.randomUUID(), replacesId: null })
      setNotice(`Booking request submitted to ${result.booking.assignedVenueStaffName}. The venue is tentatively held.`)
    } catch (err) {
      setError([err.details?.message ?? 'Unable to submit. You can retry safely.', ...Object.values(err.details?.errors ?? {})].join(' '))
    } finally { setBusy(false) }
  }
  function replace(booking) {
    setForm({ venueId: booking.venueId, startsAt: localTime(booking.startsAt), endsAt: localTime(booking.endsAt), requirements: booking.requirements,
      specialRequests: booking.specialRequests, replacesId: booking.id, submissionKey: crypto.randomUUID() })
    setNotice('Choose the replacement venue or times below. The original hold stays until your changes succeed.')
  }
  return <><Navbar /><main className="container page-shell">
    <h1>{id ? 'Venue booking requests' : 'Pending venue bookings'}</h1>
    {id && <Link to={`/requests/${id}`}>Back to event</Link>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {!data && !error && <p>Loading booking requests…</p>}
    {data?.event && <h2>{data.event.core?.title}</h2>}
    {data?.bookings.length === 0 && <p>No booking requests.</p>}
    {data?.bookings.map((booking) => <Card key={booking.id}>
      <h2>{booking.venueName}</h2>
      <dl>
        <dt>Event</dt><dd>{booking.eventTitle}</dd>
        <dt>Requested time</dt><dd>{displayTime(booking.startsAt)} – {displayTime(booking.endsAt)}</dd>
        <dt>Expected attendance</dt><dd>{booking.expectedAttendees ?? 'Not set'}</dd>
        <dt>Venue requirements</dt><dd>{booking.requirements}</dd>
        <dt>Special requests</dt><dd>{booking.specialRequests || 'None'}</dd>
        <dt>Status</dt><dd>{booking.status}</dd>
        <dt>Assigned Venue Staff</dt><dd>{booking.assignedVenueStaffName}</dd>
        <dt>Hold expiry</dt><dd>{displayTime(booking.holdExpiresAt)}{Date.parse(booking.holdExpiresAt) <= Date.now() ? ' (expired)' : ''}</dd>
      </dl>
      {booking.capacityWarning && <p role="note">{booking.capacityWarning}</p>}
      {!id && <Link to={`/requests/${booking.eventRequestId}/venue-bookings`}>View booking details</Link>}
      {data.canSubmit && !booking.replacedById && [BOOKING_PENDING, BOOKING_REJECTED].includes(booking.status) && <button type="button" disabled={busy} onClick={() => replace(booking)}>Replace request for {booking.venueName}</button>}
    </Card>)}
    {data?.canSubmit && <Card><h2>{form.replacesId ? 'Replace booking request' : 'Request a venue'}</h2>
      <form onSubmit={submit} aria-label="Venue booking request">
        <fieldset disabled={busy}>
          <div className="field"><label htmlFor="booking-venue">Venue</label><select id="booking-venue" required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}>
            <option value="">Choose a venue</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name} (capacity {v.maximumCapacity})</option>)}
          </select></div>
          {warning && <p role="note">{warning}</p>}
          {[['startsAt', 'Start', 'datetime-local'], ['endsAt', 'End', 'datetime-local'], ['requirements', 'Venue requirements', 'text'], ['specialRequests', 'Special requests', 'text']].map(([key, label, type]) =>
            <div className="field" key={key}><label htmlFor={`booking-${key}`}>{label}</label><input id={`booking-${key}`} type={type} required={key !== 'specialRequests'} maxLength={4000} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
          <button className="button button-primary" type="submit">{busy ? 'Submitting…' : form.replacesId ? 'Submit replacement' : 'Submit booking request'}</button>
          {form.replacesId && <button type="button" onClick={() => setForm({ ...form, replacesId: null, submissionKey: crypto.randomUUID() })}>Cancel replacement</button>}
        </fieldset>
      </form>
      <p>A tentative hold is not a confirmed booking. Venue Staff approval is a separate step.</p>
    </Card>}
  </main></>
}
