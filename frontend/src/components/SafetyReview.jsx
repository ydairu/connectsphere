import { useEffect, useState } from 'react'
import {
  CHECK_RESULTS,
  REJECT_SAFETY_ARRANGEMENT,
  REQUEST_SAFETY_CHANGES,
  SAFETY_CHECKLIST_ITEMS,
  SAFETY_INVALIDATED,
  SAFETY_OUTCOMES,
} from '../../../shared/safetyReview.js'
import { getSafetyVenueDetails, recordSafetyReview } from '../services/api.js'
import {
  checkResultLabel,
  invalidatedText,
  safetyNextStep,
  safetyOutcomeLabel,
  safetyStatusLabel,
} from '../utils/safetyReview.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function Row({ label, children }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}

function list(items) {
  return Array.isArray(items) && items.length > 0 ? items.join(', ') : 'None recorded'
}

// One recorded review, in full: for the assigned Coordinator and the Safety Officer (SPM-92 AC8).
function ReviewRecord({ review }) {
  return (
    <div className="request-form-section" aria-label={`Safety review ${formatDateTime(review.reviewedAt) ?? ''}`.trim()}>
      <h3>{safetyOutcomeLabel(review.outcome)}</h3>
      <Row label="Reviewed by">{review.reviewerName ?? 'Safety Officer'}</Row>
      {formatDateTime(review.reviewedAt) && <Row label="Reviewed on">{formatDateTime(review.reviewedAt)}</Row>}
      {SAFETY_CHECKLIST_ITEMS.map((item) => (
        <Row key={item.id} label={item.label}>
          {checkResultLabel(review.checklist?.[item.id]?.result)}
          {review.checklist?.[item.id]?.comment ? ` — ${review.checklist[item.id].comment}` : ''}
        </Row>
      ))}
      <Row label="Comments">{review.comments || 'None'}</Row>
      <Row label="Internal notes">{review.internalNotes || 'None'}</Row>
    </div>
  )
}

// SPM-66 AC2 — the booked venues' capacity, layouts, accessibility and operating hours for the review.
function VenueDetails({ user, requestId }) {
  const [venues, setVenues] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    getSafetyVenueDetails(user, requestId)
      .then((response) => { if (active) setVenues(response.venues) })
      .catch(() => { if (active) setError('We could not load the booked venues.') })
    return () => { active = false }
  }, [user, requestId])

  return (
    <>
      <h3>Booked venues</h3>
      {error && <p className="form-note">{error}</p>}
      {venues?.length === 0 && <p className="form-note">No approved venue booking is recorded for this event.</p>}
      {venues?.map((venue) => (
        <div className="request-form-section" key={venue.bookingRequestId} aria-label={venue.venueName ?? 'Booked venue'}>
          <h4>{venue.venueName ?? 'Venue'}</h4>
          {venue.venueMissing && <p className="form-note">This venue is no longer in the catalogue.</p>}
          <Row label="Attendance at this venue">{venue.attendeeCount ?? 'Not set'}</Row>
          <Row label="Venue capacity">{venue.maximumCapacity ?? 'Not recorded'}</Row>
          {venue.capacityWarning && <p className="form-note">{venue.capacityWarning}</p>}
          <Row label="Requested layout">{venue.requirements || 'Not set'}</Row>
          <Row label="Supported layouts">{list(venue.supportedLayouts)}</Row>
          <Row label="Accessibility features">{list(venue.accessibilityFeatures)}</Row>
          <Row label="Facilities">{list(venue.facilities)}</Row>
          <Row label="Operating hours (venue restriction)">{venue.operatingHours ?? 'Not recorded'}</Row>
          {venue.specialRequests && <Row label="Special requests">{venue.specialRequests}</Row>}
        </div>
      ))}
    </>
  )
}

const emptyChecklist = () => Object.fromEntries(SAFETY_CHECKLIST_ITEMS.map((item) => [item.id, { result: '', comment: '' }]))

// SPM-92 — the checklist and the one outcome. Validation is the server's (shared/safetyReview.js); the form
// only asks for what it needs and shows each error beside its field.
function ReviewForm({ user, requestId, busy, onRecorded }) {
  const [checklist, setChecklist] = useState(emptyChecklist)
  const [outcome, setOutcome] = useState('')
  const [comments, setComments] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const commentsRequired = outcome === REQUEST_SAFETY_CHANGES || outcome === REJECT_SAFETY_ARRANGEMENT

  const setItem = (id, field, value) => setChecklist((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setErrors({})
    try {
      await recordSafetyReview(user, requestId, { outcome, checklist, comments, internalNotes })
      onRecorded(outcome)
    } catch (error) {
      if (error.status === 400 && error.details?.errors) {
        setErrors(error.details.errors)
        setMessage('Please complete the highlighted fields.')
      } else {
        setMessage(error.details?.message ?? 'We could not record the review. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (path) => errors[path] && <span className="field-error" id={`${path}-error`}>{errors[path]}</span>

  return (
    <div role="group" aria-label="Record safety review">
      <h3>Safety checklist</h3>
      {message && <div className="alert alert-error" role="alert">{message}</div>}
      <div className="safety-checklist">
        {SAFETY_CHECKLIST_ITEMS.map((item) => (
          <fieldset className="safety-checklist-item" key={item.id}>
            <legend>{item.label}</legend>
            <div className="field">
              <label htmlFor={`safety-${item.id}-result`}>Result</label>
              <select
                id={`safety-${item.id}-result`}
                value={checklist[item.id].result}
                onChange={(event) => setItem(item.id, 'result', event.target.value)}
                aria-invalid={Boolean(errors[`checklist.${item.id}`])}
              >
                <option value="">Choose a result</option>
                {CHECK_RESULTS.map((result) => <option key={result} value={result}>{checkResultLabel(result)}</option>)}
              </select>
              {fieldError(`checklist.${item.id}`)}
            </div>
            <div className="field">
              <label htmlFor={`safety-${item.id}-comment`}>Comment</label>
              <textarea id={`safety-${item.id}-comment`} rows={2} value={checklist[item.id].comment} onChange={(event) => setItem(item.id, 'comment', event.target.value)} />
              {fieldError(`checklist.${item.id}.comment`)}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="role-selector">
        <legend>Outcome</legend>
        {SAFETY_OUTCOMES.map((value) => (
          <label key={value} className={`role-option${outcome === value ? ' selected' : ''}`}>
            <input type="radio" name="safety-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            <span>{safetyOutcomeLabel(value)}</span>
          </label>
        ))}
        {fieldError('outcome')}
      </fieldset>

      <div className="field">
        <label htmlFor="safety-comments">{`Comments for the coordinator and organiser (${commentsRequired ? 'required' : 'optional'})`}</label>
        <textarea id="safety-comments" rows={3} value={comments} onChange={(event) => setComments(event.target.value)} aria-invalid={Boolean(errors.comments)} />
        {fieldError('comments')}
      </div>
      <div className="field">
        <label htmlFor="safety-internal-notes">Internal notes (not shown to the organiser)</label>
        <textarea id="safety-internal-notes" rows={3} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
        {fieldError('internalNotes')}
      </div>
      <div className="form-actions">
        <Button type="button" onClick={submit} disabled={busy || saving}>{saving ? 'Recording…' : 'Record safety review'}</Button>
      </div>
    </div>
  )
}

// SPM-91/92 — the event's safety check as the API summarised it for this user (`summary`, null when there is
// nothing they may see), the booked venues and the review form for a Safety Officer (`canDecide`). The
// summary carries `reviews` only for the assigned Coordinator and the Safety Officer; the Organiser's has the
// latest outcome and comments only, never internal notes.
function SafetyReview({ user, requestId, eventStatus, summary, canDecide, busy, onRecorded }) {
  if (!summary && !canDecide) return null
  const full = Array.isArray(summary?.reviews)

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Safety check</h2>
      </div>
      {summary && (
        <>
          <Row label="Status">{safetyStatusLabel(summary.status)}</Row>
          {safetyNextStep(summary.status, eventStatus) && <p className="form-note">{safetyNextStep(summary.status, eventStatus)}</p>}
          {summary.status === SAFETY_INVALIDATED && full && <p className="form-note">{invalidatedText(summary.invalidatedReason)}</p>}
        </>
      )}

      {summary && !full && summary.outcome && (
        <>
          <Row label="Outcome">{safetyOutcomeLabel(summary.outcome)}</Row>
          {summary.comments && <Row label="Comments from the Safety Officer">{summary.comments}</Row>}
          {formatDateTime(summary.reviewedAt) && <Row label="Reviewed on">{formatDateTime(summary.reviewedAt)}</Row>}
        </>
      )}

      {canDecide && <VenueDetails user={user} requestId={requestId} />}
      {canDecide && <ReviewForm user={user} requestId={requestId} busy={busy} onRecorded={onRecorded} />}

      {full && summary.reviews.length > 0 && (
        <>
          <h3>{canDecide ? 'Earlier reviews' : 'Recorded reviews'}</h3>
          {summary.reviews.map((review, index) => <ReviewRecord key={`${review.reviewedAt}-${index}`} review={review} />)}
        </>
      )}
    </Card>
  )
}

export default SafetyReview
