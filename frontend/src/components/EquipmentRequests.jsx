import { useCallback, useEffect, useState } from 'react'
import {
  APPROVE_EQUIPMENT_REQUEST,
  EQUIPMENT_REQUEST_STATUS_LABELS,
  EQUIPMENT_REQUEST_STATUS,
  MAX_REJECTION_TEXT_LENGTH,
  RECONFIRM_EQUIPMENT_APPROVAL,
  REJECT_EQUIPMENT_REQUEST,
  MAX_EQUIPMENT_REQUEST_ITEMS,
  MAX_TECHNICAL_REQUIREMENTS_LENGTH,
  normaliseEquipmentRequest,
} from '../../../shared/equipmentRequest.js'
import { CHECKABLE_REQUEST_STATUSES, shortfallSummary } from '../../../shared/equipmentAvailabilityCheck.js'
import { TECHNICAL_STAFF } from '../../../shared/permissions.js'
import { useAuth } from '../hooks/useAuth.js'
import { checkEquipmentAvailability, decideEquipmentRequest, listEquipment, listEquipmentRequests, submitEquipmentRequest } from '../services/api.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

// SPM-17 — the event's equipment requests. The assigned Coordinator sees the list and, at Planning with no
// request waiting for review, a form to request equipment types and quantities; the assigned Technical
// Support Staff member sees the same list read-only. Anyone else gets 404 from the API and sees nothing.
//
// Rendered inside the request page's form, so it has no <form> of its own: its buttons are type="button".

const emptyRow = () => ({ key: crypto.randomUUID(), equipmentTypeId: '', quantity: '1', technicalRequirements: '' })

const displayTime = (value) =>
  !value || Number.isNaN(Date.parse(value)) ? 'Not set' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Row({ label, children }) {
  return <div className="profile-row"><span>{label}</span><strong>{children}</strong></div>
}

function FieldError({ id, message }) {
  return message ? <span className="field-error" id={id}>{message}</span> : null
}

function OrganiserEquipment({ equipment }) {
  const requirements = Array.isArray(equipment?.requirements) ? equipment.requirements : []
  return (
    <div className="equipment-reference" aria-label="Organiser's equipment needs">
      <h3>Organiser&apos;s equipment needs</h3>
      <p className="form-note">For reference. Request the catalogue equipment that meets them below.</p>
      {requirements.length ? <ul>{requirements.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None listed.</p>}
      <p>Technical support needed: {equipment?.technicalSupportNeeded ? 'Yes' : 'No'}</p>
    </div>
  )
}

// SPM-18 — the assigned Technical Support Staff member checks whether the request can be fulfilled for its
// period. The button is shown to the Technical Support role; the API decides whether this member may check.
// SPM-56: when the member may act on the request, the check runs as soon as the card loads (each item shows
// its available quantity), and the review panel owns the result so Approve can follow it.
function AvailabilityCheck({ user, eventId, request, autoCheck = false, result: controlledResult, onResult }) {
  const [ownResult, setOwnResult] = useState(null)
  const result = onResult ? controlledResult : ownResult
  const setResult = onResult ?? setOwnResult
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  const requestId = request.id
  const check = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      setResult((await checkEquipmentAvailability(user, eventId, requestId)).availability)
    } catch (failure) {
      setResult(null)
      setError(failure?.status === 404 ? 'Only the Technical Support Staff member assigned to this request can check it.' : failure?.details?.message ?? 'Availability could not be checked. Please try again.')
    } finally {
      setChecking(false)
    }
  }, [user, eventId, requestId, setResult])

  // Checked once when the panel appears for a member who may act; "Check again" re-runs it.
  useEffect(() => {
    if (autoCheck) check()
  }, [autoCheck, check])

  return (
    <div className="equipment-availability" aria-label={`Availability for equipment request ${request.id}`}>
      <Button type="button" variant="secondary" disabled={checking} onClick={check}>
        {checking ? 'Checking…' : result ? 'Check again' : 'Check availability'}
      </Button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {result && (
        <>
          <p className={`alert alert-${result.fulfillable ? 'success' : 'error'}`} role="status">
            {result.fulfillable ? 'Can be fulfilled: every equipment type has enough available units.' : 'Shortfall: this request cannot be fulfilled.'}
          </p>
          <ul className="equipment-items">
            {result.items.map((item) => (
              <li key={item.equipmentTypeId}>
                <strong>{item.equipmentTypeName ?? item.equipmentTypeId}</strong>: {item.availableQuantity} available, {item.requestedQuantity} requested
                {item.sufficient ? ' — enough' : ` — short by ${item.shortfall}`}
                {item.technicalRequirements && <span className="form-note"> Check the technical requirements yourself: {item.technicalRequirements}</span>}
              </li>
            ))}
          </ul>
          <p className="form-note">
            Counts Available units of each type for {displayTime(result.requiredPeriod?.startsAt)} to {displayTime(result.requiredPeriod?.endsAt)}.
            Equipment reservations are not recorded yet, so units reserved for other events are not subtracted.
          </p>
        </>
      )}
    </div>
  )
}

// SPM-56 / SPM-36 — what the user may do with this request now comes from the API (`actions`). Approve and
// Re-confirm need a check showing the request can be fulfilled; Reject does not (a request may be rejected for
// other reasons, such as technical requirements that cannot be met) and opens a form for the reason.
const ACTION_LABELS = Object.freeze({
  [APPROVE_EQUIPMENT_REQUEST]: 'Approve request',
  [RECONFIRM_EQUIPMENT_APPROVAL]: 'Re-confirm approval',
})

const DECIDED_MESSAGES = Object.freeze({
  [APPROVE_EQUIPMENT_REQUEST]: 'Approved. The technical arrangement is approved.',
  [RECONFIRM_EQUIPMENT_APPROVAL]: 'Approval re-confirmed. The technical arrangement is approved again.',
  [REJECT_EQUIPMENT_REQUEST]: 'Rejected. The Coordinator has been notified.',
})

function RejectForm({ request, initialReason, busy, errors, onConfirm, onCancel }) {
  const [reason, setReason] = useState(initialReason ?? '')
  const [alternative, setAlternative] = useState('')
  const reasonId = `reject-reason-${request.id}`
  const alternativeId = `reject-alternative-${request.id}`
  const blank = reason.trim() === ''

  return (
    <div className="equipment-reject" role="group" aria-label={`Reject equipment request ${request.id}`}>
      <div className="field">
        <label htmlFor={reasonId}>Reason for rejection (required)</label>
        <textarea id={reasonId} rows={3} maxLength={MAX_REJECTION_TEXT_LENGTH} value={reason} onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? `${reasonId}-error` : undefined} />
        <FieldError id={`${reasonId}-error`} message={errors.reason} />
        {blank && <p className="form-note">Enter a reason to continue.</p>}
      </div>
      <div className="field">
        <label htmlFor={alternativeId}>Suggested alternative (optional)</label>
        <textarea id={alternativeId} rows={2} maxLength={MAX_REJECTION_TEXT_LENGTH} value={alternative} onChange={(event) => setAlternative(event.target.value)}
          aria-invalid={Boolean(errors.suggestedAlternative)} aria-describedby={errors.suggestedAlternative ? `${alternativeId}-error` : undefined} />
        <FieldError id={`${alternativeId}-error`} message={errors.suggestedAlternative} />
      </div>
      <div className="form-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={busy || blank} onClick={() => onConfirm({ reason, suggestedAlternative: alternative })}>Confirm rejection</Button>
      </div>
    </div>
  )
}

function ReviewPanel({ user, eventId, request, busy, onDecided }) {
  const [result, setResult] = useState(null)
  const [deciding, setDeciding] = useState(false)
  const [message, setMessage] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const actions = request.actions ?? []
  const approveActions = actions.filter((action) => action !== REJECT_EQUIPMENT_REQUEST)
  const canReject = actions.includes(REJECT_EQUIPMENT_REQUEST)

  async function decide(action, details) {
    setDeciding(true)
    setMessage(null)
    setFieldErrors({})
    try {
      if (details) await decideEquipmentRequest(user, eventId, request.id, action, details)
      else await decideEquipmentRequest(user, eventId, request.id, action)
      setRejecting(false)
      await onDecided(DECIDED_MESSAGES[action])
    } catch (failure) {
      // A shortfall found by the server's own check replaces the result shown, so the reason is visible.
      if (failure?.details?.availability) setResult(failure.details.availability)
      if (failure?.details?.errors) setFieldErrors(failure.details.errors)
      setMessage(failure?.details?.errors ? 'Check the highlighted fields.' : failure?.details?.message ?? 'The request could not be updated. Please try again.')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="equipment-review">
      <AvailabilityCheck user={user} eventId={eventId} request={request} autoCheck={actions.length > 0} result={result} onResult={setResult} />
      {actions.length > 0 && (
        <div className="equipment-actions" role="group" aria-label={`Review equipment request ${request.id}`}>
          {approveActions.map((action) => (
            <Button key={action} type="button" disabled={busy || deciding || rejecting || result?.fulfillable !== true} onClick={() => decide(action)}>
              {deciding ? 'Saving…' : ACTION_LABELS[action] ?? action}
            </Button>
          ))}
          {canReject && !rejecting && (
            <Button type="button" variant="secondary" disabled={busy || deciding} onClick={() => { setFieldErrors({}); setRejecting(true) }}>
              Reject request
            </Button>
          )}
          {approveActions.length > 0 && result?.fulfillable === false && <p className="form-note">A request with a shortfall cannot be approved.</p>}
          {approveActions.length > 0 && result === null && <p className="form-note">Approval is available once availability has been checked.</p>}
          {actions.includes(RECONFIRM_EQUIPMENT_APPROVAL) && (
            <p className="form-note">A significant change to the event cleared the technical sign-off. Re-confirm to approve it again (until SPM-87 removes the automatic reset).</p>
          )}
          {rejecting && (
            <RejectForm
              request={request}
              initialReason={shortfallSummary(result)}
              busy={busy || deciding}
              errors={fieldErrors}
              onConfirm={(details) => decide(REJECT_EQUIPMENT_REQUEST, details)}
              onCancel={() => { setRejecting(false); setFieldErrors({}); setMessage(null) }}
            />
          )}
          {message && <p className="field-error" role="alert">{message}</p>}
        </div>
      )}
    </div>
  )
}

function EquipmentRequests({ user, eventId, organiserEquipment, busy = false, onDecided }) {
  const { roles = [] } = useAuth()
  const isTechnicalStaff = roles.includes(TECHNICAL_STAFF)
  const [data, setData] = useState(null)
  const [types, setTypes] = useState([])
  const [rows, setRows] = useState(() => [emptyRow()])
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await listEquipmentRequests(user, eventId)
      setData(response)
      if (response.canSubmit) setTypes((await listEquipment(user)).equipment ?? [])
    } catch (error) {
      setData(error?.status === 404 ? { hidden: true } : { failed: true })
    }
  }, [user, eventId])

  useEffect(() => {
    load()
  }, [load])

  // SPM-56: the queue opens the Equipment Required tab and scrolls here once the card has loaded.
  const shown = Boolean(data && !data.hidden)
  useEffect(() => {
    if (shown && window.location.hash === '#equipment-requests') document.getElementById('equipment-requests')?.scrollIntoView?.()
  }, [shown])

  if (!data || data.hidden) return null

  function updateRow(key, field, value) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  function removeRow(key) {
    setRows((current) => current.filter((row) => row.key !== key))
    setErrors({})
  }

  async function submit() {
    const body = {
      submissionKey,
      items: rows.map(({ equipmentTypeId, quantity, technicalRequirements }) => ({ equipmentTypeId, quantity, technicalRequirements })),
    }
    setMessage(null)
    // The same rules the API applies, so obvious mistakes are shown before anything is sent.
    const local = normaliseEquipmentRequest(body).errors
    if (Object.keys(local).length) {
      setErrors(local)
      setMessage({ type: 'error', text: 'Check the highlighted fields.' })
      return
    }
    setSubmitting(true)
    try {
      const { equipmentRequest } = await submitEquipmentRequest(user, eventId, body)
      setRows([emptyRow()])
      setSubmissionKey(crypto.randomUUID())
      setErrors({})
      setMessage({ type: 'success', text: `Equipment request sent to ${equipmentRequest.assignedTechnicalStaffName} for review.` })
      await load()
    } catch (error) {
      // The entered rows and the submission reference are kept, so a retry cannot create a second request.
      setErrors(error?.details?.errors ?? {})
      setMessage({ type: 'error', text: error?.details?.errors ? 'Check the highlighted fields.' : error?.details?.message ?? 'Unable to submit. You can retry safely.' })
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = busy || submitting
  // SPM-36: after a rejection the form submits the revision (the server links it with replacesId).
  const revising = (data.requests ?? []).some((request) => request.status === EQUIPMENT_REQUEST_STATUS.REJECTED && !request.replacedById)

  async function handleDecided(text) {
    setMessage({ type: 'success', text })
    await load()
    if (onDecided) await onDecided()
  }

  return (
    <Card className="request-form-section equipment-requests">
      <div className="section-heading" id="equipment-requests"><h2>Equipment requests</h2></div>
      {/* A plain note, not an alert: loading this card is secondary to the request page's own messages. */}
      {data.failed && (
        <p className="form-note">
          Equipment requests could not be loaded.{' '}
          <Button type="button" variant="secondary" onClick={load}>Try again</Button>
        </p>
      )}
      {message && <div className={`alert alert-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}

      {data.requests?.length === 0 && <p>No equipment requests yet.</p>}
      {data.requests?.map((request) => (
        <div className="equipment-request" key={request.id} aria-label={`Equipment request ${request.id}`}>
          <Row label="Status">{EQUIPMENT_REQUEST_STATUS_LABELS[request.status] ?? request.status}</Row>
          <Row label="Required from">{displayTime(request.requiredPeriod?.startsAt)}</Row>
          <Row label="Required until">{displayTime(request.requiredPeriod?.endsAt)}</Row>
          <Row label="Technical Support Staff">{request.assignedTechnicalStaffName}</Row>
          {request.replacesId && <Row label="Replaces">The rejected request {request.replacesId}</Row>}
          {request.approvedAt && <Row label="Approved by">{`${request.approvedByName ?? 'Technical Support Staff'}, ${displayTime(request.approvedAt)}`}</Row>}
          {request.reconfirmedAt && <Row label="Re-confirmed by">{`${request.reconfirmedByName ?? 'Technical Support Staff'}, ${displayTime(request.reconfirmedAt)}`}</Row>}
          {request.rejectedAt && <Row label="Rejected by">{`${request.rejectedByName ?? 'Technical Support Staff'}, ${displayTime(request.rejectedAt)}`}</Row>}
          {request.rejectionReason && <Row label="Reason for rejection">{request.rejectionReason}</Row>}
          {request.suggestedAlternative && <Row label="Suggested alternative">{request.suggestedAlternative}</Row>}
          <ul className="equipment-items">
            {request.items.map((item) => (
              <li key={item.equipmentTypeId}>
                <strong>{item.quantity} × {item.equipmentTypeName}</strong>
                {item.technicalRequirements && <span> — {item.technicalRequirements}</span>}
              </li>
            ))}
          </ul>
          {isTechnicalStaff && CHECKABLE_REQUEST_STATUSES.includes(request.status) && (
            <ReviewPanel user={user} eventId={eventId} request={request} busy={busy} onDecided={handleDecided} />
          )}
        </div>
      ))}

      {data.canSubmit && (
        <div className="equipment-request-form" role="group" aria-label="Request equipment">
          <OrganiserEquipment equipment={organiserEquipment} />
          <h3>{revising ? 'Submit a revised request' : 'Request equipment'}</h3>
          {revising && <p className="form-note">This replaces the rejected request.</p>}
          <p className="form-note">Choose equipment types and quantities. Technical Support Staff choose the units when they reserve them.</p>
          {errors.items && <p className="field-error" role="alert">{errors.items}</p>}
          {rows.map((row, index) => {
            const prefix = `equipment-${index}`
            const error = (field) => errors[`items.${index}.${field}`]
            const described = (field) => (error(field) ? { 'aria-invalid': true, 'aria-describedby': `${prefix}-${field}-error` } : {})
            return (
              <fieldset className="equipment-row" key={row.key} disabled={disabled}>
                <legend>Item {index + 1}</legend>
                <div className="field">
                  <label htmlFor={`${prefix}-type`}>Equipment type</label>
                  <select id={`${prefix}-type`} value={row.equipmentTypeId} onChange={(event) => updateRow(row.key, 'equipmentTypeId', event.target.value)} {...described('equipmentTypeId')}>
                    <option value="">Choose a type</option>
                    {types.map((type) => <option key={type.id} value={type.id}>{type.name} ({type.availableUnits} available)</option>)}
                  </select>
                  <FieldError id={`${prefix}-equipmentTypeId-error`} message={error('equipmentTypeId')} />
                </div>
                <div className="field">
                  <label htmlFor={`${prefix}-quantity`}>Quantity</label>
                  <input id={`${prefix}-quantity`} type="number" min="1" step="1" inputMode="numeric" value={row.quantity} onChange={(event) => updateRow(row.key, 'quantity', event.target.value)} {...described('quantity')} />
                  <FieldError id={`${prefix}-quantity-error`} message={error('quantity')} />
                </div>
                <div className="field">
                  <label htmlFor={`${prefix}-requirements`}>Technical requirements (optional)</label>
                  <textarea id={`${prefix}-requirements`} rows={2} maxLength={MAX_TECHNICAL_REQUIREMENTS_LENGTH} value={row.technicalRequirements} onChange={(event) => updateRow(row.key, 'technicalRequirements', event.target.value)} {...described('technicalRequirements')} />
                  <FieldError id={`${prefix}-technicalRequirements-error`} message={error('technicalRequirements')} />
                </div>
                {rows.length > 1 && <Button type="button" variant="secondary" onClick={() => removeRow(row.key)}>Remove item {index + 1}</Button>}
              </fieldset>
            )
          })}
          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={disabled || rows.length >= MAX_EQUIPMENT_REQUEST_ITEMS} onClick={() => setRows((current) => [...current, emptyRow()])}>Add item</Button>
            <Button type="button" disabled={disabled} onClick={submit}>{submitting ? 'Submitting…' : 'Submit equipment request'}</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default EquipmentRequests
