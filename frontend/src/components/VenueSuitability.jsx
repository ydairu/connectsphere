import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SUITABLE, SUITABLE_WITH_WARNINGS, UNSUITABLE, venueRequirements } from '../../../shared/venueSuitability.js'
import { getVenueSuitability, updateRequest } from '../services/api.js'
import Button from './Button.jsx'
import Card from './Card.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'

const LOAD_ERROR = 'We could not check venue suitability. Please try again.'
const SAVE_ERROR = 'We could not save the venue requirements. Please try again.'

const RESULT_LABELS = Object.freeze({
  [SUITABLE]: 'Suitable',
  [SUITABLE_WITH_WARNINGS]: 'Suitable with warnings',
  [UNSUITABLE]: 'Unsuitable',
})

const BOOKING_STATUS_LABELS = Object.freeze({
  pending: 'Request pending',
  approved: 'Request approved',
})

const REQUIREMENT_GROUPS = Object.freeze([
  {
    field: 'requiredFacilities',
    option: 'facilities',
    legend: 'Required facilities',
    hint: 'A venue without every ticked facility is unsuitable.',
    empty: 'No facilities are recorded in the venue catalogue yet.',
  },
  {
    field: 'requiredAccessibilityFeatures',
    option: 'accessibilityFeatures',
    legend: 'Required accessibility features',
    hint: 'A venue without a ticked feature gets a warning but can still be selected.',
    empty: 'No accessibility features are recorded in the venue catalogue yet.',
  },
])

function sameValues(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function MessageList({ title, items }) {
  if (items.length === 0) return null
  return (
    <div className="suitability-messages">
      <p>{title}</p>
      <ul>
        {items.map((item) => (
          <li key={`${item.check}-${item.message}`}>{item.message}</li>
        ))}
      </ul>
    </div>
  )
}

function SuitabilityItem({ venue, note }) {
  return (
    <li className={`suitability-item suitability-${venue.result}`}>
      <div className="suitability-item-heading">
        <div>
          <h3>{venue.id ? <Link to={`/venues/${venue.id}`}>{venue.name}</Link> : venue.name}</h3>
          <p className="request-meta">
            {[note, venue.location, venue.maximumCapacity != null && `Capacity ${venue.maximumCapacity}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="suitability-badge">{RESULT_LABELS[venue.result]}</span>
      </div>
      <MessageList title="Why it is unsuitable" items={venue.problems} />
      <MessageList title="Warnings" items={venue.warnings} />
    </li>
  )
}

function EventSummary({ event }) {
  const parts = [
    event.expectedAttendees != null && `${event.expectedAttendees} expected attendees`,
    event.period?.label,
    event.layoutPreference && `${event.layoutPreference} layout`,
  ].filter(Boolean)
  return <p className="request-meta">Checked against: {parts.join(' · ') || 'no event details recorded'}</p>
}

// SPM-13 — the assigned Coordinator sees how every catalogue venue fits this event, and chooses the
// facilities and accessibility features the event needs from the values the catalogue records. Rendered
// only when the API says canCheckVenueSuitability; the API checks again. Saving the requirements goes
// through the ordinary request edit, so it is recorded in the change history (SPM-28).
function VenueSuitability({ user, request, busy, onRequirementsSaved }) {
  const saved = venueRequirements(request)
  const savedKey = JSON.stringify(saved)
  const [suitability, setSuitability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selected, setSelected] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  // A new response for the request (after any save on the page) resets the choices to what is stored.
  useEffect(() => {
    setSelected(JSON.parse(savedKey))
  }, [savedKey])

  // Checked again whenever the stored requirements or the status change.
  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await getVenueSuitability(user, request.id)
        if (active) setSuitability(response)
      } catch (error) {
        if (active) setLoadError(error.details?.message ?? LOAD_ERROR)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user, request.id, request.status, savedKey])

  function toggle(field, value) {
    setSaveStatus(null)
    setSelected((current) => ({
      ...current,
      [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
    }))
  }

  // Only the lists that changed are sent, so the history records nothing for an untouched one.
  const changed = REQUIREMENT_GROUPS.filter(({ field }) => !sameValues(selected[field], saved[field]))

  async function saveRequirements() {
    setSaving(true)
    setSaveStatus(null)
    try {
      const venue = Object.fromEntries(changed.map(({ field }) => [field, selected[field]]))
      const response = await updateRequest(user, request.id, { venue })
      onRequirementsSaved(response)
      setSaveStatus({ type: 'success', message: 'Venue requirements saved. Suitability has been checked again.' })
    } catch (error) {
      const fieldMessages = Object.values(error.details?.errors ?? {})
      setSaveStatus({ type: 'error', message: fieldMessages[0] ?? error.details?.message ?? SAVE_ERROR })
    } finally {
      setSaving(false)
    }
  }

  const options = suitability?.options ?? { facilities: [], accessibilityFeatures: [] }
  const event = suitability?.event
  const eventVenues = suitability?.eventVenues ?? []
  const accessibilityPrompt = event?.accessibilityRequired && selected.requiredAccessibilityFeatures.length === 0

  return (
    <Card className="request-form-section venue-suitability">
      <div className="section-heading">
        <h2>Venue suitability</h2>
      </div>
      <p className="request-meta">
        Each venue is checked for capacity, availability, required facilities, layout, accessibility and operating hours.
        Availability includes the venue&apos;s setup time before the event and turnaround time after it. Too little capacity, a
        booking or block that overlaps the event or its setup or turnaround, or a missing required facility makes a venue
        unsuitable. Layout, accessibility and operating hours give warnings only. Every venue the event has requested is
        checked on its own.
      </p>
      {event && <EventSummary event={event} />}

      <div className="field-row">
        {REQUIREMENT_GROUPS.map(({ field, option, legend, hint, empty }) => {
          // A stored value no longer in the catalogue stays listed, so it can be unticked.
          const values = [...new Set([...(options[option] ?? []), ...selected[field]])]
          return (
            <fieldset className="filter-group" key={field}>
              <legend>{legend}</legend>
              <p className="request-meta">{hint}</p>
              {values.length === 0 ? (
                <p className="request-meta">{empty}</p>
              ) : (
                <div className="filter-options">
                  {values.map((value, index) => (
                    <label key={value} className="checkbox-field" htmlFor={`${field}-${index}`}>
                      <input
                        id={`${field}-${index}`}
                        type="checkbox"
                        checked={selected[field].includes(value)}
                        onChange={() => toggle(field, value)}
                        disabled={busy || saving}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )
        })}
      </div>

      {accessibilityPrompt && (
        <div className="alert alert-info" role="note">
          The Organiser says accessibility is required{event.accessibilityNeeds ? `: ${event.accessibilityNeeds}` : ''}. Tick the
          accessibility features to check venues for.
        </div>
      )}

      {saveStatus && <div className={`alert alert-${saveStatus.type}`} role="status">{saveStatus.message}</div>}

      <div className="form-actions">
        <Button type="button" onClick={saveRequirements} disabled={busy || saving || changed.length === 0}>
          {saving ? 'Saving requirements...' : 'Save requirements'}
        </Button>
      </div>

      {loading && <LoadingSpinner label="Checking venues" />}
      {!loading && loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
      {!loading && !loadError && suitability && (
        <section className="suitability-group" aria-labelledby="event-venues-heading">
          <h3 id="event-venues-heading">This event&apos;s venues</h3>
          {eventVenues.length === 0 ? (
            <p className="request-meta">
              This event has no pending or approved venue request yet. Each venue you request is checked here separately.
            </p>
          ) : (
            <ul className="suitability-list" aria-label="Event venue suitability results">
              {eventVenues.map((venue) => (
                <SuitabilityItem key={venue.bookingId} venue={venue} note={BOOKING_STATUS_LABELS[venue.bookingStatus]} />
              ))}
            </ul>
          )}
        </section>
      )}
      {!loading && !loadError && suitability?.venues.length === 0 && (
        <p className="request-meta">No venues are recorded in the venue catalogue yet.</p>
      )}
      {!loading && !loadError && suitability?.venues.length > 0 && (
        <section className="suitability-group" aria-labelledby="catalogue-venues-heading">
          <h3 id="catalogue-venues-heading">All catalogue venues</h3>
          <ul className="suitability-list" aria-label="Venue suitability results">
            {suitability.venues.map((venue) => (
              <SuitabilityItem key={venue.id} venue={venue} />
            ))}
          </ul>
        </section>
      )}
    </Card>
  )
}

export default VenueSuitability
