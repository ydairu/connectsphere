import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getVenueAvailability, listVenues } from '../services/api.js'

const STATUS_LABELS = {
  [AVAILABILITY_STATUS.AVAILABLE]: 'Available',
  [AVAILABILITY_STATUS.CONFIRMED_BOOKING]: 'Confirmed booking',
  [AVAILABILITY_STATUS.TENTATIVE_HOLD]: 'Tentative hold',
  [AVAILABILITY_STATUS.MAINTENANCE_BLOCK]: 'Maintenance block',
}

function localDateTimeValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function defaultRange() {
  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const end = new Date(start)
  end.setHours(18, 0, 0, 0)
  return {
    from: localDateTimeValue(start),
    to: localDateTimeValue(end),
  }
}

function toDisplayTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function toApiDateTime(value) {
  return new Date(value).toISOString()
}

function moveRange({ from, to }, direction) {
  const start = new Date(from)
  const end = new Date(to)
  const duration = end.getTime() - start.getTime()
  const nextStart = new Date(start.getTime() + duration * direction)
  const nextEnd = new Date(end.getTime() + duration * direction)
  return {
    from: localDateTimeValue(nextStart),
    to: localDateTimeValue(nextEnd),
  }
}

function slotClassName(status) {
  return `availability-slot availability-slot-${status.replaceAll('_', '-')}`
}

function VenueAvailabilityPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [venues, setVenues] = useState([])
  const [range, setRange] = useState(defaultRange)
  const [availability, setAvailability] = useState(null)
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [error, setError] = useState(null)

  const selectedVenue = useMemo(() => venues.find((venue) => venue.id === id), [id, venues])

  useEffect(() => {
    let active = true

    async function loadVenues() {
      try {
        const response = await listVenues(user)
        if (active) setVenues(response.venues)
      } catch (venueError) {
        if (!active) return
        if (venueError.status === 401) setError('Your session has expired. Please log in again.')
        else if (venueError.status === 403) setError('You do not have access to venue availability.')
        else setError('We could not load the venue list. Please try again.')
      } finally {
        if (active) setLoadingVenues(false)
      }
    }

    loadVenues()
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    let active = true

    async function loadAvailability() {
      if (!id || !range.from || !range.to) return
      setLoadingAvailability(true)
      setError(null)

      try {
        const response = await getVenueAvailability(user, id, {
          from: toApiDateTime(range.from),
          to: toApiDateTime(range.to),
        })
        if (active) setAvailability(response.availability)
      } catch (availabilityError) {
        if (!active) return
        setAvailability(null)
        if (availabilityError.status === 400) setError('Choose a valid period where the end is after the start.')
        else if (availabilityError.status === 401) setError('Your session has expired. Please log in again.')
        else if (availabilityError.status === 403) setError('You do not have access to venue availability.')
        else if (availabilityError.status === 404) setError('This venue no longer exists.')
        else setError('We could not load venue availability. Please try again.')
      } finally {
        if (active) setLoadingAvailability(false)
      }
    }

    loadAvailability()
    return () => {
      active = false
    }
  }, [id, range.from, range.to, user])

  function updateRange(field, value) {
    setRange((current) => ({ ...current, [field]: value }))
  }

  function shiftRange(direction) {
    setRange((current) => moveRange(current, direction))
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <span className="eyebrow"><Link to="/venues">Venue catalogue</Link></span>
            <h1>Venue availability</h1>
            <p>View confirmed bookings, tentative holds, maintenance blocks, and open time slots before planning.</p>
          </div>
          {id && <Link className="button button-secondary" to={`/venues/${id}`}>Back to venue details</Link>}
        </div>

        <Card className="request-form-section availability-controls">
          <h2>Choose venue and period</h2>
          <div className="venue-field-grid">
            <div className="field">
              <label htmlFor="venueId">Venue</label>
              <select
                id="venueId"
                value={id ?? ''}
                onChange={(event) => navigate(`/venues/${event.target.value}/availability`)}
                disabled={loadingVenues || venues.length === 0}
              >
                {loadingVenues && <option value="">Loading venues...</option>}
                {!loadingVenues && venues.length === 0 && <option value="">No venues recorded</option>}
                {!loadingVenues && venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
            </div>
            <div className="availability-range-actions">
              <button className="button button-secondary" type="button" onClick={() => shiftRange(-1)}>Previous period</button>
              <button className="button button-secondary" type="button" onClick={() => shiftRange(1)}>Next period</button>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="availabilityFrom">From</label>
              <input
                id="availabilityFrom"
                type="datetime-local"
                value={range.from}
                onChange={(event) => updateRange('from', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="availabilityTo">To</label>
              <input
                id="availabilityTo"
                type="datetime-local"
                value={range.to}
                onChange={(event) => updateRange('to', event.target.value)}
              />
            </div>
          </div>
        </Card>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {(loadingVenues || loadingAvailability) && !error && <Card><LoadingSpinner label="Loading availability" /></Card>}

        {!loadingVenues && !loadingAvailability && !error && availability && (
          <Card className="request-form-section availability-calendar">
            <div className="section-heading">
              <div>
                <h2>{selectedVenue?.name ?? 'Selected venue'}</h2>
                <p className="request-meta">
                  {toDisplayTime(availability.range.from)} to {toDisplayTime(availability.range.to)}
                </p>
              </div>
            </div>
            <div className="availability-legend" aria-label="Availability legend">
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <span key={status} className={slotClassName(status)}>{label}</span>
              ))}
            </div>
            <ol className="availability-slot-list" aria-label="Availability slots">
              {availability.slots.map((slot) => (
                <li key={`${slot.status}-${slot.startsAt}-${slot.endsAt}`} className={slotClassName(slot.status)}>
                  <strong>{STATUS_LABELS[slot.status] ?? slot.status}</strong>
                  <span>{toDisplayTime(slot.startsAt)} to {toDisplayTime(slot.endsAt)}</span>
                  {slot.title && <span>{slot.title}</span>}
                </li>
              ))}
            </ol>
          </Card>
        )}
      </main>
    </div>
  )
}

export default VenueAvailabilityPage
