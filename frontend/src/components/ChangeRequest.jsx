import { useEffect, useState } from 'react'
import {
  ACCEPT_CHANGE,
  CHANGE_ACCEPTED,
  CHANGE_CLOSED,
  CHANGE_DECLINED,
  CHANGE_PENDING,
  CHANGE_REQUEST_FIELDS,
  CHANGE_RETURNED,
  DECLINE_CHANGE,
  RETURN_CHANGE,
} from '../../../shared/changeRequests.js'
import { decideChangeRequest, getChangeRequestAssessment, submitChangeRequest } from '../services/api.js'
import { fieldLabel, formatHistoryValue } from '../utils/changeHistory.js'
import { buildPatch, hasChanges, toFormValues } from '../utils/requestPatch.js'
import { sectionFields } from '../utils/requestSections.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

// SPM-20 / SPM-40 — the owning Organiser requests changes to their submitted event; the assigned Coordinator sees
// them flagged, assesses them and accepts, declines or returns them. `changeRequest` is the API's summary, sent only
// to those two; the server decides everything, and the card only offers what the response allows.

const STATUS_TEXT = {
  [CHANGE_PENDING]: 'Awaiting the event coordinator’s decision',
  [CHANGE_RETURNED]: 'Returned for modification',
  [CHANGE_ACCEPTED]: 'Accepted',
  [CHANGE_DECLINED]: 'Declined',
  [CHANGE_CLOSED]: 'Closed with the event',
}

const FORM_SECTIONS = ['core', 'venue', 'equipment']
const FORM_FIELDS = FORM_SECTIONS.flatMap((section) => sectionFields(section)
  .filter((field) => CHANGE_REQUEST_FIELDS.includes(`${section}.${field.name}`))
  .map((field) => ({ section, field })))

function ChangeField({ section, field, value, onChange, error }) {
  const id = `change-${section}-${field.name}`
  if (field.type === 'boolean') {
    return (
      <label className="checkbox-field" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    )
  }
  const shared = { id, value, onChange: (event) => onChange(event.target.value), 'aria-invalid': Boolean(error) }
  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'textarea' || field.type === 'list'
        ? <textarea rows={3} {...shared} />
        : <input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'} {...shared} />}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

function RequestForm({ user, request, resubmitting, busy, onDone, onCancel }) {
  const [form, setForm] = useState(() => toFormValues(request))
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  async function send() {
    const changes = buildPatch(request, form, FORM_SECTIONS)
    if (!hasChanges(changes)) {
      setMessage('Change at least one field.')
      return
    }
    setSaving(true)
    setMessage(null)
    setErrors({})
    try {
      onDone(await submitChangeRequest(user, request.id, { changes, reason }))
    } catch (error) {
      setErrors(error.details?.errors ?? {})
      setMessage(error.details?.errors ? 'Please correct the highlighted fields.' : error.details?.message ?? 'We could not send your request. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="group" aria-label="Request a change">
      <p>Changes apply only if the event coordinator accepts them. Your venue bookings and equipment stay in place while they decide.</p>
      {message && <div className="alert alert-error" role="alert">{message}</div>}
      {FORM_FIELDS.map(({ section, field }) => (
        <ChangeField
          key={`${section}.${field.name}`}
          section={section}
          field={field}
          value={form[section]?.[field.name] ?? ''}
          error={errors[`${section}.${field.name}`]}
          onChange={(value) => setForm((current) => ({ ...current, [section]: { ...current[section], [field.name]: value } }))}
        />
      ))}
      <div className="field">
        <label htmlFor="change-reason">Reason for the change (optional)</label>
        <textarea id="change-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      <div className="form-actions" style={{ gap: 12, justifyContent: 'flex-start' }}>
        <Button type="button" disabled={busy || saving} onClick={send}>{resubmitting ? 'Resubmit change request' : 'Send change request'}</Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>Keep the event as it is</Button>
      </div>
    </div>
  )
}

// SPM-40 AC1, AC2: what the proposal may affect, and how the booked venues suit it. Nothing here is released or reset.
function Assessment({ user, requestId }) {
  const [assessment, setAssessment] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    getChangeRequestAssessment(user, requestId)
      .then((response) => { if (active) setAssessment(response) })
      .catch(() => { if (active) setError('We could not load the assessment.') })
    return () => { active = false }
  }, [user, requestId])

  if (error) return <p className="form-note">{error}</p>
  if (!assessment) return null
  return (
    <div role="group" aria-label="Assessment of the proposed change">
      <h3>Arrangements that may be affected</h3>
      {assessment.affected.length === 0
        ? <p className="form-note">No recorded sign-off is affected.</p>
        : <ul className="value-list">{assessment.affected.map((item) => <li key={item.key}>{item.label}</li>)}</ul>}
      {assessment.venues.map((venue) => (
        <div key={venue.bookingId}>
          <h4>{venue.venueName ?? 'Booked venue'} with these changes</h4>
          {venue.problems.length === 0 && venue.warnings.length === 0 && <p className="form-note">No problems found.</p>}
          <ul className="value-list">
            {venue.problems.map((problem) => <li key={problem.message}>{problem.message}</li>)}
            {venue.warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}
          </ul>
        </div>
      ))}
      <p className="form-note">If you accept, you then choose which sign-offs need re-approval. Nothing is released or reset automatically.</p>
    </div>
  )
}

function Decision({ user, requestId, changeRequest, busy, onDone }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const { decisions } = changeRequest

  async function decide(decision) {
    setSaving(true)
    setMessage(null)
    try {
      onDone(await decideChangeRequest(user, requestId, { decision, reason: reason.trim() || undefined }), decision)
    } catch (error) {
      setMessage(error.details?.errors?.reason ?? error.details?.message ?? 'We could not record your decision. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="group" aria-label="Decide the change request">
      {message && <div className="alert alert-error" role="alert">{message}</div>}
      <div className="field">
        <label htmlFor="change-decision-reason">Message to the organiser (required to decline or return)</label>
        <textarea id="change-decision-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      <div className="form-actions" style={{ gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        {decisions.includes(ACCEPT_CHANGE) && <Button type="button" disabled={busy || saving} onClick={() => decide(ACCEPT_CHANGE)}>Accept change</Button>}
        {decisions.includes(RETURN_CHANGE) && <Button type="button" variant="secondary" disabled={busy || saving} onClick={() => decide(RETURN_CHANGE)}>Return for modification</Button>}
        {decisions.includes(DECLINE_CHANGE) && <Button type="button" variant="secondary" disabled={busy || saving} onClick={() => decide(DECLINE_CHANGE)}>Decline change</Button>}
      </div>
    </div>
  )
}

function ChangeRequest({ user, request, changeRequest, canSubmit, busy, onUpdated }) {
  const [editing, setEditing] = useState(false)
  if (!changeRequest && !canSubmit) return null
  const returned = changeRequest?.status === CHANGE_RETURNED

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Change request</h2>
      </div>

      {changeRequest && (
        <>
          <div className="profile-row"><span>Status</span><strong>{STATUS_TEXT[changeRequest.status] ?? changeRequest.status}</strong></div>
          {changeRequest.significant && (
            <p className="form-note"><strong>Significant change.</strong> Accepting it starts a re-review of the event’s arrangements.</p>
          )}
          <ul className="value-list" aria-label="Requested changes">
            {changeRequest.changes.map((change) => (
              <li key={change.field}>
                {fieldLabel(change.field)}: {formatHistoryValue(change.field, change.current)} → {formatHistoryValue(change.field, change.proposed)}
                {change.significant && ' (significant)'}
              </li>
            ))}
          </ul>
          {changeRequest.reason && <div className="profile-row"><span>Reason given</span><strong>{changeRequest.reason}</strong></div>}
          {changeRequest.decisionReason && <div className="profile-row"><span>Message from the event coordinator</span><strong>{changeRequest.decisionReason}</strong></div>}
          {changeRequest.status === CHANGE_PENDING && changeRequest.significant && changeRequest.decisions.length > 0 && <Assessment user={user} requestId={request.id} />}
          {changeRequest.decisions.length > 0 && (
            <Decision user={user} requestId={request.id} changeRequest={changeRequest} busy={busy} onDone={(response, decision) => onUpdated(response, decision)} />
          )}
        </>
      )}

      {canSubmit && (editing
        ? <RequestForm user={user} request={request} resubmitting={returned} busy={busy} onCancel={() => setEditing(false)} onDone={(response) => { setEditing(false); onUpdated(response, 'submit') }} />
        : (
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>{returned ? 'Modify and resubmit' : 'Request a change'}</Button>
          </div>
        ))}
    </Card>
  )
}

export default ChangeRequest
