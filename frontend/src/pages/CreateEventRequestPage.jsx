import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORGANISER } from '../../../shared/permissions.js'
import { normaliseEventRequestInput } from '../../../shared/eventRequest.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createEventRequest } from '../services/api.js'

const initialForm = {
  title: '',
  purpose: '',
  description: '',
  expectedAttendees: '',
  durationHours: '',
  preferredDateTime: '',
  layoutPreference: '',
  accessibilityRequired: false,
  accessibilityNeeds: '',
  equipmentRequirements: '',
  technicalSupportNeeded: false,
  registrationEnabled: false,
  registrationNotes: '',
}

function toPayload(form) {
  return {
    core: {
      title: form.title,
      purpose: form.purpose,
      description: form.description,
      expectedAttendees: form.expectedAttendees,
      durationHours: form.durationHours,
      preferredDateTime: form.preferredDateTime,
    },
    venue: {
      layoutPreference: form.layoutPreference,
      accessibilityRequired: form.accessibilityRequired,
      accessibilityNeeds: form.accessibilityNeeds,
    },
    equipment: {
      requirements: form.equipmentRequirements,
      technicalSupportNeeded: form.technicalSupportNeeded,
    },
    registration: {
      enabled: form.registrationEnabled,
      notes: form.registrationNotes,
    },
  }
}

function fieldError(errors, path) {
  return errors[path]
}

function TextArea({ id, label, error, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  )
}

function Checkbox({ id, label, ...props }) {
  return (
    <label className="checkbox-field" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}

function CreateEventRequestPage() {
  const { user, roles } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: null, message: '' })
  const [saving, setSaving] = useState(false)

  const isOrganiser = useMemo(() => roles.includes(ORGANISER), [roles])

  function updateField(event) {
    const { name, type, checked, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus({ type: null, message: '' })

    const payload = toPayload(form)
    const { errors: validationErrors } = normaliseEventRequestInput(payload)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setStatus({ type: 'error', message: 'Fix the highlighted fields before saving.' })
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const { eventRequest } = await createEventRequest(user, payload)
      setStatus({
        type: 'success',
        message: `Request saved as draft. Reference: ${eventRequest.id}`,
      })
    } catch (error) {
      const apiErrors = error.details?.errors
      if (apiErrors) setErrors(apiErrors)
      setStatus({
        type: 'error',
        message: apiErrors ? 'Fix the highlighted fields before saving.' : 'Could not save the request. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!isOrganiser) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="request-page container">
          <Card className="empty-profile">
            <h1>Event Organiser access required</h1>
            <p>Only Event Organisers can create event requests.</p>
            <Link className="button button-secondary" to="/profile">Back to profile</Link>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="profile-heading">
          <div>
            <span className="eyebrow">SPM-7</span>
            <h1>Create Event Request</h1>
            <p>Start an unsubmitted event request. Saving here does not submit it for staff review.</p>
          </div>
          <Link className="button button-secondary" to="/profile">Back to profile</Link>
        </div>

        <form onSubmit={handleSubmit}>
          {status.message && <div className={`alert alert-${status.type}`}>{status.message}</div>}

          <Card className="request-form-section">
            <h2>Core Details</h2>
            <Input id="title" name="title" label="Event title/name" value={form.title} onChange={updateField} error={fieldError(errors, 'core.title')} />
            <Input id="purpose" name="purpose" label="Purpose" value={form.purpose} onChange={updateField} error={fieldError(errors, 'core.purpose')} />
            <TextArea id="description" name="description" label="Description" value={form.description} onChange={updateField} error={fieldError(errors, 'core.description')} rows="4" />
            <div className="field-row">
              <Input id="expectedAttendees" name="expectedAttendees" label="Expected attendance" type="number" min="1" value={form.expectedAttendees} onChange={updateField} error={fieldError(errors, 'core.expectedAttendees')} />
              <Input id="durationHours" name="durationHours" label="Duration in hours" type="number" min="0.5" step="0.5" value={form.durationHours} onChange={updateField} error={fieldError(errors, 'core.durationHours')} />
            </div>
            <Input id="preferredDateTime" name="preferredDateTime" label="Preferred date/time" type="datetime-local" value={form.preferredDateTime} onChange={updateField} error={fieldError(errors, 'core.preferredDateTime')} />
          </Card>

          <Card className="request-form-section">
            <h2>Venue And Layout</h2>
            <TextArea id="layoutPreference" name="layoutPreference" label="Venue/layout preferences" value={form.layoutPreference} onChange={updateField} error={fieldError(errors, 'venue.layoutPreference')} rows="3" />
            <Checkbox id="accessibilityRequired" name="accessibilityRequired" label="Accessibility support is needed" checked={form.accessibilityRequired} onChange={updateField} />
            <TextArea id="accessibilityNeeds" name="accessibilityNeeds" label="Accessibility needs" value={form.accessibilityNeeds} onChange={updateField} error={fieldError(errors, 'venue.accessibilityNeeds')} rows="3" />
          </Card>

          <Card className="request-form-section">
            <h2>Equipment And Registration</h2>
            <TextArea id="equipmentRequirements" name="equipmentRequirements" label="Equipment requirements" value={form.equipmentRequirements} onChange={updateField} error={fieldError(errors, 'equipment.requirements')} rows="4" placeholder="One item per line" />
            <Checkbox id="technicalSupportNeeded" name="technicalSupportNeeded" label="Technical support is needed" checked={form.technicalSupportNeeded} onChange={updateField} />
            <Checkbox id="registrationEnabled" name="registrationEnabled" label="Attendee registration is needed" checked={form.registrationEnabled} onChange={updateField} />
            <TextArea id="registrationNotes" name="registrationNotes" label="Registration needs" value={form.registrationNotes} onChange={updateField} error={fieldError(errors, 'registration.notes')} rows="3" />
          </Card>

          <div className="form-actions">
            <Button type="submit" disabled={saving}>{saving ? 'Saving request...' : 'Save unsubmitted request'}</Button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default CreateEventRequestPage
