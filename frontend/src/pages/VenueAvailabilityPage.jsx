import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SETUP_SLOT, TURNAROUND_SLOT } from '../../../shared/venueCalendar.js'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import {
  createMaintenanceBlock,
  getVenueAvailability,
  listVenues,
  removeMaintenanceBlock,
  updateMaintenanceBlock,
} from '../services/api.js'

const STATUS_LABELS = {
  [AVAILABILITY_STATUS.AVAILABLE]: 'Available',
  [AVAILABILITY_STATUS.CONFIRMED_BOOKING]: 'Confirmed booking',
  [AVAILABILITY_STATUS.TENTATIVE_HOLD]: 'Tentative hold',
  [AVAILABILITY_STATUS.MAINTENANCE_BLOCK]: 'Maintenance block',
  // SPM-73: the venue is occupied for these too, but they are shown apart from the event time itself.
  [SETUP_SLOT]: 'Setup',
  [TURNAROUND_SLOT]: 'Turnaround',
}

function minutesText(minutes) {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

// SPM-73: the venue's own setup and turnaround times, which every booking and hold occupies.
function bufferSummary(buffers) {
  if (!buffers) return null
  const { setupMinutes, turnaroundMinutes } = buffers
  if (!setupMinutes && !turnaroundMinutes) return 'This venue has no setup or turnaround time.'
  return `This venue needs ${minutesText(setupMinutes)} of setup before and ${minutesText(turnaroundMinutes)} of turnaround after each booking or hold. Those periods are unavailable.`
}

function slotTitle(slot) {
  if (!slot.title) return null
  if (slot.status === SETUP_SLOT) return `Before ${slot.title}`
  if (slot.status === TURNAROUND_SLOT) return `After ${slot.title}`
  return slot.title
}

const MAINTENANCE_REASONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'safety', label: 'Safety' },
  { value: 'internal_activity', label: 'Internal activity' },
  { value: 'other', label: 'Other' },
]

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

function defaultBlockForm() {
  const range = defaultRange()
  return {
    startsAt: range.from,
    endsAt: range.to,
    reason: 'maintenance',
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
  const { user, roles = [] } = useAuth()
  const [venues, setVenues] = useState([])
  const [range, setRange] = useState(defaultRange)
  const [blockForm, setBlockForm] = useState(defaultBlockForm)
  const [editingBlockId, setEditingBlockId] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [savingBlock, setSavingBlock] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState(null)
  const [blockError, setBlockError] = useState(null)
  const [blockMessage, setBlockMessage] = useState(null)

  const selectedVenue = useMemo(() => venues.find((venue) => venue.id === id), [id, venues])
  const canManageMaintenanceBlocks = roles.includes(VENUE_STAFF)
  const maintenanceSlots = useMemo(
    () => availability?.slots.filter((slot) => slot.status === AVAILABILITY_STATUS.MAINTENANCE_BLOCK && slot.id) ?? [],
    [availability],
  )

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
  }, [id, range.from, range.to, refreshKey, user])

  function updateRange(field, value) {
    setRange((current) => ({ ...current, [field]: value }))
  }

  function shiftRange(direction) {
    setRange((current) => moveRange(current, direction))
  }

  function updateBlockForm(field, value) {
    setBlockForm((current) => ({ ...current, [field]: value }))
  }

  function startEditingBlock(slot) {
    setEditingBlockId(slot.id)
    setBlockForm({
      startsAt: localDateTimeValue(new Date(slot.startsAt)),
      endsAt: localDateTimeValue(new Date(slot.endsAt)),
      reason: slot.reason || 'maintenance',
    })
    setBlockError(null)
    setBlockMessage(null)
  }

  function resetBlockForm() {
    setEditingBlockId(null)
    setBlockForm(defaultBlockForm())
    setBlockError(null)
  }

  async function saveMaintenanceBlock(event) {
    event.preventDefault()
    if (!id) return

    setSavingBlock(true)
    setBlockError(null)
    setBlockMessage(null)

    const payload = {
      startsAt: toApiDateTime(blockForm.startsAt),
      endsAt: toApiDateTime(blockForm.endsAt),
      reason: blockForm.reason,
    }

    try {
      if (editingBlockId) {
        await updateMaintenanceBlock(user, id, editingBlockId, payload)
        setBlockMessage('Maintenance block updated.')
      } else {
        await createMaintenanceBlock(user, id, payload)
        setBlockMessage('Maintenance block created.')
      }
      setEditingBlockId(null)
      setRefreshKey((current) => current + 1)
    } catch (saveError) {
      if (saveError.status === 400) setBlockError('Check the start date, end date, and reason.')
      else if (saveError.status === 403) setBlockError('Only Venue Staff can manage maintenance blocks.')
      else if (saveError.status === 404) setBlockError('This venue or maintenance block no longer exists.')
      else setBlockError('We could not save the maintenance block. Please try again.')
    } finally {
      setSavingBlock(false)
    }
  }

  async function removeBlock(blockId) {
    if (!id) return

    setSavingBlock(true)
    setBlockError(null)
    setBlockMessage(null)

    try {
      await removeMaintenanceBlock(user, id, blockId)
      if (editingBlockId === blockId) setEditingBlockId(null)
      setBlockMessage('Maintenance block removed.')
      setRefreshKey((current) => current + 1)
    } catch (removeError) {
      if (removeError.status === 403) setBlockError('Only Venue Staff can manage maintenance blocks.')
      else if (removeError.status === 404) setBlockError('This maintenance block no longer exists.')
      else setBlockError('We could not remove the maintenance block. Please try again.')
    } finally {
      setSavingBlock(false)
    }
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

        {canManageMaintenanceBlocks && !loadingVenues && !error && (
          <Card className="request-form-section maintenance-block-panel">
            <div className="section-heading">
              <div>
                <h2>{editingBlockId ? 'Amend maintenance block' : 'Block venue period'}</h2>
                <p className="request-meta">Mark this venue unavailable for maintenance, renovation, safety issues, or internal use.</p>
              </div>
            </div>
            {blockError && <div className="alert alert-error" role="alert">{blockError}</div>}
            {blockMessage && <div className="alert alert-success" role="status">{blockMessage}</div>}
            <form className="venue-form" onSubmit={saveMaintenanceBlock}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="blockStartsAt">Start date</label>
                  <input
                    id="blockStartsAt"
                    type="datetime-local"
                    value={blockForm.startsAt}
                    onChange={(event) => updateBlockForm('startsAt', event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="blockEndsAt">End date</label>
                  <input
                    id="blockEndsAt"
                    type="datetime-local"
                    value={blockForm.endsAt}
                    onChange={(event) => updateBlockForm('endsAt', event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="blockReason">Reason</label>
                <select
                  id="blockReason"
                  value={blockForm.reason}
                  onChange={(event) => updateBlockForm('reason', event.target.value)}
                  required
                >
                  {MAINTENANCE_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={savingBlock || !id}>
                  {savingBlock ? 'Saving...' : editingBlockId ? 'Save changes' : 'Create maintenance block'}
                </button>
                {editingBlockId && (
                  <button className="button button-secondary" type="button" onClick={resetBlockForm} disabled={savingBlock}>
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </Card>
        )}

        {!loadingVenues && !loadingAvailability && !error && availability && (
          <Card className="request-form-section availability-calendar">
            <div className="section-heading">
              <div>
                <h2>{selectedVenue?.name ?? 'Selected venue'}</h2>
                <p className="request-meta">
                  {toDisplayTime(availability.range.from)} to {toDisplayTime(availability.range.to)}
                </p>
                {bufferSummary(availability.buffers) && <p className="request-meta">{bufferSummary(availability.buffers)}</p>}
              </div>
            </div>
            <div className="availability-legend" aria-label="Availability legend">
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <span key={status} className={slotClassName(status)}>{label}</span>
              ))}
            </div>
            <ol className="availability-slot-list" aria-label="Availability slots">
              {availability.slots.map((slot) => (
                <li key={`${slot.id ?? slot.status}-${slot.startsAt}-${slot.endsAt}`} className={slotClassName(slot.status)}>
                  <strong>{STATUS_LABELS[slot.status] ?? slot.status}</strong>
                  <span>{toDisplayTime(slot.startsAt)} to {toDisplayTime(slot.endsAt)}</span>
                  {slotTitle(slot) && <span>{slotTitle(slot)}</span>}
                  {slot.reason && <span>Reason: {MAINTENANCE_REASONS.find((reason) => reason.value === slot.reason)?.label ?? slot.reason}</span>}
                  {canManageMaintenanceBlocks && slot.status === AVAILABILITY_STATUS.MAINTENANCE_BLOCK && slot.id && (
                    <span className="maintenance-block-actions">
                      <button className="button button-secondary button-small" type="button" onClick={() => startEditingBlock(slot)}>
                        Amend
                      </button>
                      <button className="button button-secondary button-small" type="button" onClick={() => removeBlock(slot.id)} disabled={savingBlock}>
                        Remove
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {canManageMaintenanceBlocks && maintenanceSlots.length === 0 && (
              <p className="request-meta">No maintenance blocks are visible in this selected period.</p>
            )}
          </Card>
        )}
      </main>
    </div>
  )
}

export default VenueAvailabilityPage
