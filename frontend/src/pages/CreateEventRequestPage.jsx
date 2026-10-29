import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ORGANISER } from '../../../shared/permissions.js'
import { normaliseEventRequestInput } from '../../../shared/eventRequest.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createEventRequest, getEventRequest, submitEventRequest, updateEventRequest } from '../services/api.js'

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
  registrationOpensAt: '',
  registrationClosesAt: '',
  registrationCapacity: '',
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
      opensAt: form.registrationOpensAt,
      closesAt: form.registrationClosesAt,
      capacity: form.registrationCapacity,
      notes: form.registrationNotes,
    },
  }
}

function listToText(value) {
  if (Array.isArray(value)) return value.join('\n')
  return value ?? ''
}

function toForm(eventRequest) {
  return {
    title: eventRequest.core?.title ?? '',
    purpose: eventRequest.core?.purpose ?? '',
    description: eventRequest.core?.description ?? '',
    expectedAttendees: eventRequest.core?.expectedAttendees?.toString() ?? '',
    durationHours: eventRequest.core?.durationHours?.toString() ?? '',
    preferredDateTime: eventRequest.core?.preferredDateTime ?? '',
    layoutPreference: eventRequest.venue?.layoutPreference ?? '',
    accessibilityRequired: eventRequest.venue?.accessibilityRequired ?? false,
    accessibilityNeeds: eventRequest.venue?.accessibilityNeeds ?? '',
    equipmentRequirements: listToText(eventRequest.equipment?.requirements),
    technicalSupportNeeded: eventRequest.equipment?.technicalSupportNeeded ?? false,
    registrationEnabled: eventRequest.registration?.enabled ?? false,
    registrationOpensAt: eventRequest.registration?.opensAt ?? '',
    registrationClosesAt: eventRequest.registration?.closesAt ?? '',
    registrationCapacity: eventRequest.registration?.capacity?.toString() ?? '',
    registrationNotes: eventRequest.registration?.notes ?? '',
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
  const navigate = useNavigate()
  const { id: routeRequestId } = useParams()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: null, message: '' })
  const [toast, setToast] = useState({ title: '', message: '' })
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(Boolean(routeRequestId))
  const [draftLoadFailed, setDraftLoadFailed] = useState(false)
  const [savedRequestId, setSavedRequestId] = useState(routeRequestId ?? null)
  const [submitted, setSubmitted] = useState(false)

  const isOrganiser = useMemo(() => roles.includes(ORGANISER), [roles])
  const isEditingDraft = Boolean(routeRequestId)

  useEffect(() => {
    if (!toast.message) return undefined

    const timer = window.setTimeout(() => {
      setToast({ title: '', message: '' })
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [toast.message])

  useEffect(() => {
    let active = true

    async function loadDraft() {
      if (!routeRequestId || !isOrganiser) return

      setLoadingDraft(true)
      setDraftLoadFailed(false)
      setStatus({ type: null, message: '' })
      try {
        const { eventRequest } = await getEventRequest(user, routeRequestId)
        if (!active) return
        setForm(toForm(eventRequest))
        setSavedRequestId(eventRequest.id)
      } catch (error) {
        if (!active) return
        setDraftLoadFailed(true)
        setStatus({
          type: 'error',
          message:
            error.status === 403 || error.status === 404
              ? 'This draft could not be opened. It may not exist, may already be submitted, or may belong to another organiser.'
              : 'Could not load this draft. Please try again.',
        })
      } finally {
        if (active) setLoadingDraft(false)
      }
    }

    loadDraft()

    return () => {
      active = false
    }
  }, [isOrganiser, routeRequestId, user])

  function updateField(event) {
    const { name, type, checked, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function saveDraft({ showToast = true, validationMessage = 'Fix the highlighted fields before saving.' } = {}) {
    setStatus({ type: null, message: '' })

    const payload = toPayload(form)
    const { errors: validationErrors } = normaliseEventRequestInput(payload)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setStatus({ type: 'error', message: validationMessage })
      return null
    }

    setErrors({})
    const wasEditingSavedDraft = Boolean(savedRequestId)
    const { eventRequest } = savedRequestId
      ? await updateEventRequest(user, savedRequestId, payload)
      : await createEventRequest(user, payload)

    setSavedRequestId(eventRequest.id)
    if (!wasEditingSavedDraft) {
      navigate(`/event-requests/${eventRequest.id}/edit`, { replace: true })
    }

    if (showToast) {
      setStatus({ type: null, message: '' })
      setToast({
        title: wasEditingSavedDraft ? 'Changes saved' : 'Draft saved',
        message: wasEditingSavedDraft
          ? 'Your draft changes have been saved.'
          : 'Your event request has been saved as a draft. You can continue editing it on this page.',
      })
    }

    return eventRequest
  }

  async function handleSaveDraft(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveDraft()
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

  async function handleSubmitRequest() {
    setSubmitting(true)
    try {
      const draft = await saveDraft({
        showToast: false,
        validationMessage: 'Fix the highlighted fields before submitting.',
      })
      if (!draft) return

      await submitEventRequest(user, draft.id)
      setErrors({})
      setSubmitted(true)
      setStatus({
        type: 'success',
        message: 'Your event request has been submitted. It is no longer editable as a draft.',
      })
      setToast({
        title: 'Request submitted',
        message: 'Your event request is now available for the next staff workflow.',
      })
    } catch (error) {
      const apiErrors = error.details?.errors
      if (apiErrors) setErrors(apiErrors)
      setStatus({
        type: 'error',
        message: apiErrors
          ? 'Complete the highlighted required fields before submitting.'
          : 'Could not submit the request. Please try again.',
      })
    } finally {
      setSubmitting(false)
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
            <span className="eyebrow">{isEditingDraft ? 'SPM-4' : 'SPM-7'}</span>
            <h1>{isEditingDraft ? 'Edit Draft Event Request' : 'Create Event Request'}</h1>
            <p>
              {isEditingDraft
                ? 'Continue editing your unsubmitted draft. Saving here does not submit it for staff review.'
                : 'Start an unsubmitted event request. Saving here does not submit it for staff review.'}
            </p>
          </div>
          <Link className="button button-secondary" to="/profile">Back to profile</Link>
        </div>

        {draftLoadFailed ? (
          <Card className="empty-profile">
            {status.message && <div className={`alert alert-${status.type}`}>{status.message}</div>}
            <Link className="button button-primary" to="/requests">Back to requests</Link>
          </Card>
        ) : submitted ? (
          <Card className="empty-profile">
            <h2>Submitted for review</h2>
            <p>Your event request has been submitted and can no longer be edited as a draft.</p>
            <Link className="button button-primary" to="/requests">Back to requests</Link>
          </Card>
        ) : (
        <form onSubmit={handleSaveDraft}>
          {status.message && <div className={`alert alert-${status.type}`}>{status.message}</div>}
          {loadingDraft && <div className="alert alert-info">Loading saved draft...</div>}

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
            {/* SPM-19: the registration period and capacity. Registration opens to Attendees once the event is confirmed. */}
            <Input id="registrationOpensAt" name="registrationOpensAt" label="Registration opens" type="datetime-local" value={form.registrationOpensAt} onChange={updateField} error={fieldError(errors, 'registration.opensAt')} />
            <Input id="registrationClosesAt" name="registrationClosesAt" label="Registration closes" type="datetime-local" value={form.registrationClosesAt} onChange={updateField} error={fieldError(errors, 'registration.closesAt')} />
            <Input id="registrationCapacity" name="registrationCapacity" label="Registration capacity" type="number" min="1" value={form.registrationCapacity} onChange={updateField} error={fieldError(errors, 'registration.capacity')} />
            <TextArea id="registrationNotes" name="registrationNotes" label="Registration needs" value={form.registrationNotes} onChange={updateField} error={fieldError(errors, 'registration.notes')} rows="3" />
          </Card>

          <div className="form-actions">
            <Button type="submit" disabled={saving || submitting || loadingDraft}>
              {saving ? 'Saving request...' : savedRequestId ? 'Save changes' : 'Save unsubmitted request'}
            </Button>
            <Button type="button" variant="secondary" disabled={saving || submitting || loadingDraft} onClick={handleSubmitRequest}>
              {submitting ? 'Submitting request...' : 'Submit request'}
            </Button>
          </div>
        </form>
        )}
      </main>
      {toast.message && (
        <div className="toast" role="status" aria-live="polite">
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </div>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast({ title: '', message: '' })}>Close</button>
        </div>
      )}
    </div>
  )
}

export default CreateEventRequestPage
