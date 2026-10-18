import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BOOKING_PENDING, BOOKING_APPROVED, BOOKING_CANCELLED, BOOKING_REJECTED, BOOKING_REPLACED, capacityWarning } from '../../../shared/venueBooking.js'
import { COORDINATOR } from '../../../shared/permissions.js'
import { approveVenueBooking, getVenueBookings, getVenueBookingQueue, listVenues, rejectVenueBooking, submitVenueBooking } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import Navbar from '../components/Navbar.jsx'
import Card from '../components/Card.jsx'

function localTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const displayTime = (value) => !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const emptyForm = () => ({ venueId: '', startsAt: '', endsAt: '', requirements: '', specialRequests: '', replacesId: null, submissionKey: crypto.randomUUID() })

function BookingRow({ label, children }) {
  return <div className="profile-row booking-row"><span>{label}</span><strong>{children}</strong></div>
}

export default function VenueBookingsPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const bookingId = id && searchParams.has('bookingId') ? searchParams.get('bookingId') : null
  const detailView = bookingId !== null
  const { user, roles } = useAuth()
  const [data, setData] = useState(null)
  const [venues, setVenues] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [rejectingId, setRejectingId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [staleDecision, setStaleDecision] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [suggestedAlternative, setSuggestedAlternative] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setData(null)
      setError('')
      setApprovingId(null)
      setRejectingId(null)
      setStaleDecision(false)
      try {
        const response = id ? await getVenueBookings(user, id) : await getVenueBookingQueue(user)
        const catalogue = response.canSubmit && !detailView ? await listVenues(user) : { venues: [] }
        if (!active) return
        setData(response)
        setVenues(catalogue.venues)
        const core = response.event?.core
        if (core) setForm({ ...emptyForm(), startsAt: localTime(core.preferredDateTime),
          endsAt: core.preferredDateTime && core.durationHours ? localTime(new Date(Date.parse(core.preferredDateTime) + core.durationHours * 3600000).toISOString()) : '',
          requirements: [response.event?.venue?.layoutPreference, response.event?.venue?.accessibilityNeeds].filter(Boolean).join('\n') })
      } catch (err) { if (active) setError(err.details?.message ?? 'Unable to load booking requests.') }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [id, user, bookingId, detailView, reload])
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
    setNotice(booking.status === BOOKING_REJECTED
      ? 'Choose a replacement venue or time below. The rejected booking remains in the history.'
      : 'Choose the replacement venue or times below. The original hold stays until your changes succeed.')
  }
  async function reject(event) {
    event.preventDefault()
    if (!rejectionReason.trim()) { setError('Enter a rejection reason.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { booking } = await rejectVenueBooking(user, id, rejectingId, rejectionReason, suggestedAlternative)
      setData((current) => ({ ...current, bookings: current.bookings.map((item) => item.id === rejectingId
        ? { ...item, ...booking, canReject: false, canApprove: false } : item) }))
      setRejectingId(null); setRejectionReason(''); setSuggestedAlternative('')
      setNotice('Booking request rejected. The Coordinator has been notified.')
    } catch (err) {
      setError([err.details?.message ?? 'Unable to reject the booking. Please try again.', ...Object.values(err.details?.errors ?? {})].join(' '))
      setStaleDecision([404, 409].includes(err.status))
    } finally { setBusy(false) }
  }
  async function approve(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice(''); setStaleDecision(false)
    try {
      const { booking } = await approveVenueBooking(user, id, approvingId)
      setData((current) => ({ ...current, bookings: current.bookings.map((item) => item.id === approvingId
        ? { ...item, ...booking, canApprove: false, canReject: false } : item) }))
      setApprovingId(null)
      setNotice('Booking approved. The venue is confirmed for the booked period and the Coordinator has been notified.')
    } catch (err) {
      setError([err.details?.message ?? 'Unable to approve the booking. Please try again.', ...Object.values(err.details?.errors ?? {})].join(' '))
      setStaleDecision([404, 409].includes(err.status))
    } finally { setBusy(false) }
  }
  const bookings = detailView ? data?.bookings.filter((booking) => booking.id === bookingId) : data?.bookings
  return <div className="booking-shell"><Navbar /><main className="container page-shell booking-page">
    <div className="page-heading">
      <div><h1>{detailView ? 'Venue booking details' : id ? 'Venue booking requests' : 'Pending venue bookings'}</h1>
        {!id && <p>Pending requests assigned to you, oldest first.</p>}</div>
      {!id && <button className="button button-secondary" type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>Refresh</button>}
    </div>
    {detailView ? <Link className="booking-back" to={roles?.includes(COORDINATOR) ? `/requests/${id}` : '/venues/booking-requests'}>
      {roles?.includes(COORDINATOR) ? 'Back to event' : 'Back to pending bookings'}</Link> : id && <Link className="booking-back" to={`/requests/${id}`}>Back to event</Link>}
    {error && <div className="alert alert-error" role="alert">{error}
      {!data && <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>}
    </div>}
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {loading && <p role="status">Loading booking requests...</p>}
    {!detailView && data?.event && <h2>{data.event.core?.title}</h2>}
    {bookings?.length === 0 && <Card className="request-form-section"><p>{detailView ? 'This booking request is unavailable or you do not have access to it.' : id ? 'No booking requests.' : 'No pending booking requests.'}</p></Card>}
    {bookings?.map((booking) => <Card className="request-form-section booking-card" key={booking.id}>
      <div className="section-heading"><h2>{!id ? booking.eventTitle : booking.venueName}</h2></div>
      {!id ? <>
        <BookingRow label="Requested venue">{booking.venueName}</BookingRow>
        <BookingRow label="Starts">{displayTime(booking.startsAt)}</BookingRow>
        <BookingRow label="Ends">{displayTime(booking.endsAt)}</BookingRow>
        <div className="booking-actions"><Link className="button button-secondary button-small" to={`/requests/${booking.eventRequestId}/venue-bookings?bookingId=${encodeURIComponent(booking.id)}`}>View details</Link></div>
      </> : <>
        <BookingRow label="Event">{booking.eventTitle}</BookingRow>
        <BookingRow label="Requested venue">{booking.venueName}</BookingRow>
        <BookingRow label="Starts">{displayTime(booking.startsAt)}</BookingRow>
        <BookingRow label="Ends">{displayTime(booking.endsAt)}</BookingRow>
        <BookingRow label="Expected attendance">{booking.expectedAttendees ?? 'Not set'}</BookingRow>
        <BookingRow label="Venue requirements">{booking.requirements}</BookingRow>
        <BookingRow label="Special requests">{booking.specialRequests || 'None'}</BookingRow>
        <BookingRow label="Status">{booking.status === BOOKING_APPROVED ? 'Approved — venue confirmed' : booking.status}</BookingRow>
        {booking.approvedAt && <BookingRow label="Approved at">{displayTime(booking.approvedAt)}</BookingRow>}
        {booking.status === BOOKING_REJECTED && <>
          <BookingRow label="Rejection reason">{booking.rejectionReason}</BookingRow>
          {booking.suggestedAlternative && <BookingRow label="Suggested alternative">{booking.suggestedAlternative}</BookingRow>}
        </>}
        <BookingRow label="Assigned Venue Staff">{booking.assignedVenueStaffName}</BookingRow>
        {booking.status === BOOKING_APPROVED ? <BookingRow label="Reservation">Confirmed for the booked period</BookingRow> :
          [BOOKING_REJECTED, BOOKING_CANCELLED, BOOKING_REPLACED].includes(booking.status) ? <BookingRow label="Reservation">Released</BookingRow> :
          <BookingRow label="Hold expiry">{displayTime(booking.holdExpiresAt)}{Date.parse(booking.holdExpiresAt) <= Date.now() ? ' (expired)' : ''}</BookingRow>}
        {booking.capacityWarning && <p role="note">{booking.capacityWarning}</p>}
        {booking.status === BOOKING_APPROVED && booking.approvalWarnings?.map((warning, index) => <p role="note" key={`${warning.check}-${index}`}>{warning.message}</p>)}
        {detailView && booking.canApprove && rejectingId !== booking.id && <div className="booking-actions">
          {approvingId !== booking.id ? <button className="button button-primary" type="button" disabled={busy || staleDecision} onClick={() => { setApprovingId(booking.id); setError('') }}>Approve booking</button> :
            <form onSubmit={approve} aria-label="Approve venue booking"><fieldset disabled={busy || staleDecision}>
              <p>Confirm the booking for {booking.venueName} from {displayTime(booking.startsAt)} to {displayTime(booking.endsAt)}.</p>
              <button className="button button-primary" type="submit">{busy ? 'Approving…' : 'Confirm approval'}</button>
              <button type="button" onClick={() => setApprovingId(null)}>Cancel</button>
            </fieldset></form>}
        </div>}
        {detailView && staleDecision && <button className="button button-secondary" type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Reload booking</button>}
        {detailView && booking.canReject && approvingId !== booking.id && <div className="booking-actions">
          {rejectingId !== booking.id ? <button className="button button-secondary" type="button" disabled={busy || staleDecision} onClick={() => { setRejectingId(booking.id); setError('') }}>Reject booking</button> :
            <form onSubmit={reject} aria-label="Reject venue booking"><fieldset disabled={busy || staleDecision}>
              <div className="field"><label htmlFor="rejection-reason">Rejection reason</label>
                <textarea id="rejection-reason" required maxLength={4000} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} /></div>
              <div className="field"><label htmlFor="suggested-alternative">Suggested alternative (optional)</label>
                <textarea id="suggested-alternative" maxLength={4000} value={suggestedAlternative} onChange={(e) => setSuggestedAlternative(e.target.value)} /></div>
              <button className="button button-primary" type="submit">{busy ? 'Rejecting…' : 'Confirm rejection'}</button>
              <button type="button" onClick={() => { setRejectingId(null); setError('') }}>Cancel</button>
            </fieldset></form>}
        </div>}
      </>}
      {!detailView && data.canSubmit && !booking.replacedById && [BOOKING_PENDING, BOOKING_REJECTED].includes(booking.status) && <button type="button" disabled={busy} onClick={() => replace(booking)}>Replace request for {booking.venueName}</button>}
    </Card>)}
    {!detailView && data?.canSubmit && <Card className="request-form-section"><div className="section-heading"><h2>{form.replacesId ? 'Replace booking request' : 'Request a venue'}</h2></div>
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
  </main></div>
}
