import { useCallback, useEffect, useState } from 'react'
import {
  EQUIPMENT_REQUEST_STATUS_LABELS,
  MAX_EQUIPMENT_REQUEST_ITEMS,
  MAX_TECHNICAL_REQUIREMENTS_LENGTH,
  normaliseEquipmentRequest,
} from '../../../shared/equipmentRequest.js'
import { listEquipment, listEquipmentRequests, submitEquipmentRequest } from '../services/api.js'
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

function EquipmentRequests({ user, eventId, organiserEquipment, busy = false }) {
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

  return (
    <Card className="request-form-section equipment-requests">
      <div className="section-heading"><h2>Equipment requests</h2></div>
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
          <ul className="equipment-items">
            {request.items.map((item) => (
              <li key={item.equipmentTypeId}>
                <strong>{item.quantity} × {item.equipmentTypeName}</strong>
                {item.technicalRequirements && <span> — {item.technicalRequirements}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {data.canSubmit && (
        <div className="equipment-request-form" role="group" aria-label="Request equipment">
          <OrganiserEquipment equipment={organiserEquipment} />
          <h3>Request equipment</h3>
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
