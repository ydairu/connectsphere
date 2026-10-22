import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BOOKING_PENDING, BOOKING_APPROVED, BOOKING_CANCELLED, BOOKING_REJECTED, BOOKING_REPLACED, BOOKING_EXPIRED, capacityWarning, venueBookingStatusLabel } from '../../../shared/venueBooking.js'
import { COORDINATOR } from '../../../shared/permissions.js'
import { eventPeriod } from '../../../shared/venueSuitability.js'
import { approveVenueBooking, cancelVenueBooking, getRequest, getVenueBookings, getVenueBookingQueue, listVenues, rejectVenueBooking, submitVenueBooking } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { venueBookingRequirements } from '../utils/venueBookingRequirements.js'
import Navbar from '../components/Navbar.jsx'
import Card from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import VenueSuitability from '../components/VenueSuitability.jsx'

function localTime(value) {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const displayTime = (value) => !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const emptyForm = () => ({ venueId: '', startsAt: '', endsAt: '', attendeeCount: '', requirements: '', specialRequests: '', replacesId: null, submissionKey: crypto.randomUUID() })
const bookingTabs = [{ id: 'submit', label: 'Submit a Request' }, { id: 'recommendations', label: 'Recommendations' }, { id: 'requests', label: 'Requests' }]

function Suitability({ suitability }) {
  return <>
    {suitability?.problems.length > 0 && <section aria-label="Approval blocked"><h3>Approval blocked</h3>{suitability.problems.map((item, i) => <p key={i}>{item.message}</p>)}</section>}
    {suitability?.warnings.length > 0 && <section aria-label="Suitability warnings"><h3>Suitability warnings</h3>{suitability.warnings.map((item, i) => <p key={i}>{item.message}</p>)}</section>}
  </>
}

function BookingRow({ label, children }) {
  return <div className="profile-row booking-row"><span>{label}</span><strong>{children}</strong></div>
}

export default function VenueBookingsPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const bookingId = id && searchParams.has('bookingId') ? searchParams.get('bookingId') : null
  const detailView = bookingId !== null
  const activeTab = bookingTabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'submit'
  const selectTab = (tab) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next })
  const { user, roles } = useAuth()
  const [data, setData] = useState(null)
  const [venues, setVenues] = useState([])
  const [requestResponse, setRequestResponse] = useState(null)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState(false)
  const [recommendationsReload, setRecommendationsReload] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailure, setRefreshFailure] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
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
      setCancellingId(null)
      setStaleDecision(false)
      setRefreshFailure(null)
      try {
        const response = id ? await getVenueBookings(user, id) : await getVenueBookingQueue(user)
        const period = eventPeriod(response.event)
        if (!active) return
        setData(response)
        if (response.event?.core) setForm({ ...emptyForm(), ...period, attendeeCount: response.event.core.expectedAttendees ?? '', requirements: venueBookingRequirements(response.event) })
      } catch (err) { if (active) setError(err.details?.message ?? 'Unable to load booking requests.') }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [id, user, bookingId, detailView, reload])
  useEffect(() => {
    if (!data?.canSubmit || detailView || !form.startsAt || !form.endsAt || !Number(form.attendeeCount)) { setVenues([]); return }
    let active = true
    const timer = setTimeout(() => {
      listVenues(user, { availableFrom: form.startsAt, availableTo: form.endsAt, attendance: String(form.attendeeCount) })
        .then((response) => { if (active) setVenues(response.venues) })
        .catch(() => { if (active) setVenues([]) })
    }, 150)
    return () => { active = false; clearTimeout(timer) }
  }, [data?.canSubmit, detailView, form.startsAt, form.endsAt, form.attendeeCount, user])
  useEffect(() => {
    if (!id || detailView || activeTab !== 'recommendations' || !roles?.includes(COORDINATOR)) return
    let active = true
    setRecommendationsLoading(true)
    setRecommendationsError(false)
    getRequest(user, id).then((response) => { if (active) setRequestResponse(response) })
      .catch(() => { if (active) { setRequestResponse(null); setRecommendationsError(true) } })
      .finally(() => { if (active) setRecommendationsLoading(false) })
    return () => { active = false }
  }, [id, detailView, activeTab, roles, user, recommendationsReload])
  const period = eventPeriod(data?.event)
  const replacedBooking = data?.bookings?.find((booking) => booking.id === form.replacesId)
  const availableVenues = replacedBooking?.status === BOOKING_PENDING && !venues.some((venue) => venue.id === replacedBooking.venueId)
    ? [...venues, { id: replacedBooking.venueId, name: replacedBooking.venueName }]
    : venues
  const selected = availableVenues.find((v) => v.id === form.venueId)
  const warning = selected ? capacityWarning(form.attendeeCount, selected.maximumCapacity) : null
  async function submit(event) {
    event.preventDefault()
    if (!period) { setError('Set a valid event date and duration before requesting a venue.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await submitVenueBooking(user, id, { ...form, attendeeCount: Number(form.attendeeCount) })
      setForm({ ...form, submissionKey: crypto.randomUUID(), replacesId: null })
      selectTab('requests')
      setNotice(`Booking request submitted to ${result.booking.assignedVenueStaffName}. The venue is tentatively held.`)
      try { setData(await getVenueBookings(user, id)) }
      catch { setError('The booking was submitted, but requests could not be refreshed. Reload to see the latest list.'); return }
      try { setVenues((await listVenues(user, { availableFrom: form.startsAt, availableTo: form.endsAt, attendance: String(form.attendeeCount) })).venues) }
      catch { setError('The booking was submitted, but available venues could not be refreshed. Reload before submitting another request.') }
    } catch (err) {
      setError([err.details?.message ?? 'Unable to submit. You can retry safely.', ...Object.values(err.details?.errors ?? {})].join(' '))
    } finally { setBusy(false) }
  }
  async function refreshDecision(booking, purpose) {
    setRefreshing(true); setRefreshFailure(null); setError(''); setNotice('')
    if (purpose === 'approve') setApprovingId(null)
    if (purpose === 'cancel') setCancellingId(null)
    try {
      const response = await getVenueBookings(user, id)
      setData(response)
      const current = response.bookings.find((item) => item.id === booking.id)
      if (purpose === 'approve') {
        if (!current?.canApprove) { setNotice('This booking can no longer be approved. Its current state is shown.'); return }
        if (!current.suitability) throw new Error('Missing suitability preview')
        setApprovingId(current.id)
      } else if (purpose === 'cancel') {
        if (!current?.canCancel) { setNotice('This booking can no longer be cancelled. Its current state is shown.'); return }
        setCancellingId(current.id)
      } else {
        if (!response.canSubmit || !current || current.replacedById || ![BOOKING_PENDING, BOOKING_REJECTED, BOOKING_EXPIRED, BOOKING_CANCELLED].includes(current.status)) {
          setForm(emptyForm()); setNotice('This booking can no longer be replaced. Its current state is shown.'); return
        }
        setForm({ venueId: current.venueId, startsAt: current.startsAt, endsAt: current.endsAt,
          attendeeCount: current.attendeeCount ?? response.event.core?.expectedAttendees ?? '', requirements: venueBookingRequirements(response.event), specialRequests: current.specialRequests ?? '',
          replacesId: current.id, submissionKey: crypto.randomUUID() })
        selectTab('submit')
        setNotice('Requirements refreshed from the event. Review them and any special requests before submitting. The previous booking remains in history.')
      }
    } catch {
      setError('Unable to refresh booking details. Retry before continuing.')
      setRefreshFailure({ booking, purpose })
    } finally { setRefreshing(false) }
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
  async function cancel(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice(''); setStaleDecision(false)
    try {
      await cancelVenueBooking(user, id, cancellingId)
      setCancellingId(null)
      setNotice('Booking cancelled. Only this venue reservation was released; replace it before confirming the event.')
      try { setData(await getVenueBookings(user, id)) }
      catch { setError('The booking was cancelled, but requests could not be refreshed. Reload to see the latest list.') }
    } catch (err) {
      setError(err.details?.message ?? 'Unable to cancel the booking. Reload and try again.')
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
    {detailView ? <Link className="booking-back" to={roles?.includes(COORDINATOR) ? `/requests/${id}?tab=venue-details` : '/venues/booking-requests'}>
      {roles?.includes(COORDINATOR) ? 'Back to event' : 'Back to pending bookings'}</Link> : id && <Link className="booking-back" to={`/requests/${id}`}>Back to event</Link>}
    {error && <div className="alert alert-error" role="alert">{error}
      {!data && <button className="button button-secondary" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>}
    </div>}
    {refreshFailure && <button type="button" disabled={refreshing} onClick={() => refreshDecision(refreshFailure.booking, refreshFailure.purpose)}>Retry refresh</button>}
    {refreshing && <p role="status">Refreshing booking details…</p>}
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {loading && <p role="status">Loading booking requests...</p>}
    {!detailView && data?.event && <h2>{data.event.core?.title}</h2>}
    {id && !detailView && data && <Tabs name="booking" tabs={bookingTabs} active={activeTab} onSelect={selectTab} />}
    <div id={id && !detailView && data ? `booking-${activeTab}-panel` : undefined} role={id && !detailView && data ? 'tabpanel' : undefined} aria-labelledby={id && !detailView && data ? `booking-${activeTab}-tab` : undefined}>
      {id && !detailView && data && activeTab === 'recommendations' && (!roles?.includes(COORDINATOR)
        ? <Card className="request-form-section"><p>Venue recommendations are unavailable for your role.</p></Card>
        : recommendationsLoading
        ? <Card className="request-form-section"><p role="status">Loading recommendations…</p></Card>
        : recommendationsError
          ? <Card className="request-form-section"><p>Recommendations could not be loaded.</p><button type="button" onClick={() => setRecommendationsReload((value) => value + 1)}>Try again</button></Card>
          : requestResponse?.canCheckVenueSuitability
            ? <VenueSuitability user={user} request={requestResponse.request} busy={busy} onRequirementsSaved={setRequestResponse} />
            : <Card className="request-form-section"><p>Venue recommendations are unavailable for this event at its current status.</p></Card>)}
      {id && !detailView && data && activeTab === 'submit' && !data.canSubmit && <Card className="request-form-section"><p>Venue requests can be submitted while the event is in Planning.</p></Card>}
    {(!id || detailView || activeTab === 'requests') && bookings?.length === 0 && <Card className="request-form-section"><p>{detailView ? 'This booking request is unavailable or you do not have access to it.' : id ? 'No booking requests.' : 'No pending booking requests.'}</p></Card>}
    {(!id || detailView || activeTab === 'requests') && bookings?.map((booking) => <Card className="request-form-section booking-card" key={booking.id}>
      <details open={!id || detailView ? true : undefined}>
      <summary><span>{!id ? `${booking.eventTitle} — ${booking.venueName}` : booking.venueName}</span><span>{venueBookingStatusLabel(booking.status)}</span></summary>
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
        <BookingRow label="Attendees using this venue">{booking.attendeeCount ?? booking.expectedAttendees ?? 'Not set'}</BookingRow>
        <BookingRow label="Venue requirements">{booking.requirements}</BookingRow>
        <BookingRow label="Special requests">{booking.specialRequests || 'None'}</BookingRow>
        <BookingRow label="Status">{booking.status === BOOKING_APPROVED ? 'Approved — venue confirmed' : venueBookingStatusLabel(booking.status)}</BookingRow>
        {booking.approvedAt && <BookingRow label="Approved at">{displayTime(booking.approvedAt)}</BookingRow>}
        {booking.cancelledAt && <BookingRow label="Cancelled at">{displayTime(booking.cancelledAt)}</BookingRow>}
        {booking.status === BOOKING_REJECTED && <>
          <BookingRow label="Rejection reason">{booking.rejectionReason}</BookingRow>
          {booking.suggestedAlternative && <BookingRow label="Suggested alternative">{booking.suggestedAlternative}</BookingRow>}
        </>}
        <BookingRow label="Assigned Venue Staff">{booking.assignedVenueStaffName}</BookingRow>
        {booking.status === BOOKING_APPROVED ? <BookingRow label="Reservation">Confirmed for the booked period</BookingRow> :
          [BOOKING_REJECTED, BOOKING_CANCELLED, BOOKING_REPLACED, BOOKING_EXPIRED].includes(booking.status) ? <BookingRow label="Reservation">Released</BookingRow> :
          <BookingRow label="Hold expiry">{displayTime(booking.holdExpiresAt)}{Date.parse(booking.holdExpiresAt) <= Date.now() ? ' (expired)' : ''}</BookingRow>}
        {booking.status === BOOKING_EXPIRED && <p role="note">This hold expired. The venue is available for other requests. Submit a new request while the event is in Planning.</p>}
        {booking.capacityWarning && !booking.suitability && <p role="note">{booking.capacityWarning}</p>}
        {booking.status === BOOKING_PENDING && approvingId !== booking.id && <Suitability suitability={booking.suitability} />}
        {booking.status === BOOKING_APPROVED && booking.approvalWarnings?.length > 0 && <section><h3>Warnings recorded at approval</h3>{booking.approvalWarnings.map((warning, index) => <p key={index}>{warning.message}</p>)}</section>}
        {detailView && booking.canApprove && rejectingId !== booking.id && <div className="booking-actions">
          {approvingId !== booking.id ? <button className="button button-primary" type="button" disabled={busy || refreshing || !!refreshFailure || staleDecision} onClick={() => refreshDecision(booking, 'approve')}>Approve booking</button> :
            <form onSubmit={approve} aria-label="Approve venue booking"><fieldset disabled={busy || refreshing || !!refreshFailure || staleDecision}>
              <p>Confirm the booking for {booking.venueName} from {displayTime(booking.startsAt)} to {displayTime(booking.endsAt)}.</p>
              <Suitability suitability={booking.suitability} />
              <p>Availability and requirements are checked again when you confirm.</p>
              <button className="button button-primary" type="submit" disabled={!booking.suitability || booking.suitability.problems.length > 0}>{busy ? 'Approving…' : 'Confirm approval'}</button>
              <button type="button" onClick={() => setApprovingId(null)}>Cancel</button>
            </fieldset></form>}
        </div>}
        {detailView && staleDecision && <button className="button button-secondary" type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Reload booking</button>}
        {detailView && booking.canReject && approvingId !== booking.id && <div className="booking-actions">
          {rejectingId !== booking.id ? <button className="button button-secondary" type="button" disabled={busy || refreshing || !!refreshFailure || staleDecision} onClick={() => { setRejectingId(booking.id); setError('') }}>Reject booking</button> :
            <form onSubmit={reject} aria-label="Reject venue booking"><fieldset disabled={busy || refreshing || !!refreshFailure || staleDecision}>
              <div className="field"><label htmlFor="rejection-reason">Rejection reason</label>
                <textarea id="rejection-reason" required maxLength={4000} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} /></div>
              <div className="field"><label htmlFor="suggested-alternative">Suggested alternative (optional)</label>
                <textarea id="suggested-alternative" maxLength={4000} value={suggestedAlternative} onChange={(e) => setSuggestedAlternative(e.target.value)} /></div>
              <button className="button button-primary" type="submit">{busy ? 'Rejecting…' : 'Confirm rejection'}</button>
              <button type="button" onClick={() => { setRejectingId(null); setError('') }}>Cancel</button>
            </fieldset></form>}
        </div>}
        {detailView && booking.canCancel && <div className="booking-actions">
          {cancellingId !== booking.id ? <button className="button button-secondary" type="button" disabled={busy || refreshing || !!refreshFailure || staleDecision} onClick={() => refreshDecision(booking, 'cancel')}>Cancel booking</button> :
            <form onSubmit={cancel} aria-label="Cancel venue booking"><fieldset disabled={busy || refreshing || !!refreshFailure || staleDecision}>
              <p>Cancel the approved booking for {booking.venueName}? Only this venue reservation will be released. The event will be in Planning until a replacement is approved.</p>
              <button className="button button-primary" type="submit">{busy ? 'Cancelling…' : 'Confirm booking cancellation'}</button>
              <button type="button" onClick={() => setCancellingId(null)}>Keep booking</button>
            </fieldset></form>}
        </div>}
      </>}
      {!detailView && data.canSubmit && !booking.replacedById && [BOOKING_PENDING, BOOKING_REJECTED, BOOKING_EXPIRED, BOOKING_CANCELLED].includes(booking.status) && <button type="button" disabled={busy || refreshing || !!refreshFailure} onClick={() => refreshDecision(booking, 'replace')}>Replace request for {booking.venueName}</button>}
      </details>
    </Card>)}
    {!detailView && activeTab === 'submit' && data?.canSubmit && <Card className="request-form-section"><div className="section-heading"><h2>{form.replacesId ? 'Replace booking request' : 'Request a venue'}</h2></div>
      <form onSubmit={submit} aria-label="Venue booking request">
        <fieldset disabled={busy || refreshing || !!refreshFailure}>
          <div className="field"><label htmlFor="booking-venue">Venue</label><select id="booking-venue" required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}>
            <option value="">Choose a venue</option>{availableVenues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.maximumCapacity != null ? ` (capacity ${v.maximumCapacity})` : ''}</option>)}
          </select></div>
          {period && availableVenues.length === 0 && <p className="form-note">No venues are available for this window and attendee count.</p>}
          {warning && <p role="note">{warning}</p>}
          {[['startsAt', 'Start'], ['endsAt', 'End']].map(([key, label]) =>
            <div className="field" key={key}><label htmlFor={`booking-${key}`}>{label}</label><input id={`booking-${key}`} type="datetime-local" required value={localTime(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>)}
          <div className="field"><label htmlFor="booking-attendeeCount">Attendees using this venue</label><input id="booking-attendeeCount" type="number" min="1" max={data.event.core?.expectedAttendees} required value={form.attendeeCount} onChange={(e) => setForm({ ...form, attendeeCount: e.target.value })} /></div>
          {!period && <p className="field-error">Set a valid event date and duration before requesting a venue.</p>}
          {[['requirements', 'Venue requirements', 'text'], ['specialRequests', 'Special requests', 'text']].map(([key, label, type]) =>
            <div className="field" key={key}><label htmlFor={`booking-${key}`}>{label}</label><input id={`booking-${key}`} type={type} required={key !== 'specialRequests'} maxLength={4000} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
          <button className="button button-primary" type="submit" disabled={!period || availableVenues.length === 0}>{busy ? 'Submitting…' : form.replacesId ? 'Submit replacement' : 'Submit booking request'}</button>
          {form.replacesId && <button type="button" onClick={() => setForm({ ...form, replacesId: null, submissionKey: crypto.randomUUID() })}>Cancel replacement</button>}
        </fieldset>
      </form>
      <p>A tentative hold is not a confirmed booking. Venue Staff approval is a separate step.</p>
    </Card>}
    </div>
  </main></div>
}
