import { useState } from 'react'
import { Link } from 'react-router-dom'
import { normaliseVenueInput } from '../../../shared/venue.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createVenue } from '../services/api.js'

const initialForm = {
  name: '',
  location: '',
  maximumCapacity: '',
  facilities: '',
  accessibilityFeatures: '',
  supportedLayouts: '',
  operatingHours: '',
}

function toPayload(form) {
  return {
    name: form.name,
    location: form.location,
    maximumCapacity: form.maximumCapacity,
    facilities: form.facilities,
    accessibilityFeatures: form.accessibilityFeatures,
    supportedLayouts: form.supportedLayouts,
    operatingHours: form.operatingHours,
  }
}

function TextArea({ id, label, hint, error, ...props }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} />
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  )
}

function CreateVenuePage() {
  const { user } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: null, message: '' })
  const [createdVenue, setCreatedVenue] = useState(null)
  const [saving, setSaving] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus({ type: null, message: '' })
    setCreatedVenue(null)

    const payload = toPayload(form)
    const { errors: validationErrors } = normaliseVenueInput(payload)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setStatus({ type: 'error', message: 'Fix the highlighted fields before saving this venue.' })
      return
    }

    setSaving(true)
    setErrors({})
    try {
      const { venue } = await createVenue(user, payload)
      setCreatedVenue(venue)
      setForm(initialForm)
      setStatus({ type: 'success', message: 'Venue added to the catalogue.' })
    } catch (error) {
      const apiErrors = error.details?.errors
      if (apiErrors) setErrors(apiErrors)
      setStatus({
        type: 'error',
        message: apiErrors ? 'Fix the highlighted fields before saving this venue.' : 'Could not add the venue. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container request-page">
        <section className="profile-heading">
          <p className="eyebrow">Venue catalogue</p>
          <h1>Add a venue</h1>
          <p>Record one independently bookable venue space so it can be used in later availability and booking workflows.</p>
        </section>

        <Card>
          {status.message && (
            <div className={`alert ${status.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">
              {status.message}
            </div>
          )}

          {createdVenue && (
            <div className="alert alert-success" role="status">
              <strong>{createdVenue.name}</strong> was saved with capacity {createdVenue.maximumCapacity}.
            </div>
          )}

          <form className="request-form" onSubmit={handleSubmit} noValidate>
            <section className="request-form-section">
              <h2>Venue details</h2>
              <Input
                id="venue-name"
                name="name"
                label="Venue name"
                value={form.name}
                onChange={updateField}
                error={errors.name}
                placeholder="Conference Hall A"
                required
              />
              <Input
                id="venue-location"
                name="location"
                label="Physical location"
                value={form.location}
                onChange={updateField}
                error={errors.location}
                placeholder="Level 3, Main Campus"
                required
              />
              <Input
                id="venue-capacity"
                name="maximumCapacity"
                label="Maximum capacity"
                type="number"
                min="1"
                step="1"
                value={form.maximumCapacity}
                onChange={updateField}
                error={errors.maximumCapacity}
                required
              />
            </section>

            <section className="request-form-section">
              <h2>Facilities and layouts</h2>
              <TextArea
                id="venue-facilities"
                name="facilities"
                label="Facilities"
                hint="Enter one facility per line."
                rows={4}
                value={form.facilities}
                onChange={updateField}
                error={errors.facilities}
                placeholder={'Projector\nStage\nWi-Fi'}
                required
              />
              <TextArea
                id="venue-accessibility"
                name="accessibilityFeatures"
                label="Accessibility features"
                hint="Enter one accessibility feature per line."
                rows={4}
                value={form.accessibilityFeatures}
                onChange={updateField}
                error={errors.accessibilityFeatures}
                placeholder={'Wheelchair access\nAccessible washroom'}
                required
              />
              <TextArea
                id="venue-layouts"
                name="supportedLayouts"
                label="Supported room layouts"
                hint="Enter one supported layout per line."
                rows={4}
                value={form.supportedLayouts}
                onChange={updateField}
                error={errors.supportedLayouts}
                placeholder={'Theatre\nClassroom'}
                required
              />
            </section>

            <section className="request-form-section">
              <h2>Operating hours</h2>
              <TextArea
                id="venue-operating-hours"
                name="operatingHours"
                label="Operating hours"
                rows={3}
                value={form.operatingHours}
                onChange={updateField}
                error={errors.operatingHours}
                placeholder="Monday-Friday 09:00-18:00"
                required
              />
            </section>

            <div className="form-actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving venue...' : 'Add venue'}
              </Button>
              <Link className="button button-secondary" to="/requests">
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      </main>
    </div>
  )
}

export default CreateVenuePage
