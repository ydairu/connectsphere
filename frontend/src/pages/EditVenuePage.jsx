import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { normaliseVenueInput } from '../../../shared/venue.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getVenue, updateVenue } from '../services/api.js'

const editableFields = {
  location: '',
  maximumCapacity: '',
  facilities: '',
  accessibilityFeatures: '',
  supportedLayouts: '',
  operatingHours: '',
}

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function toForm(venue) {
  return {
    location: venue.location ?? '',
    maximumCapacity: venue.maximumCapacity == null ? '' : String(venue.maximumCapacity),
    facilities: listToText(venue.facilities),
    accessibilityFeatures: listToText(venue.accessibilityFeatures),
    supportedLayouts: listToText(venue.supportedLayouts),
    operatingHours: venue.operatingHours ?? '',
  }
}

function toPayload(form) {
  return {
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

function EditVenuePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [venue, setVenue] = useState(null)
  const [form, setForm] = useState(editableFields)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ type: null, message: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function loadVenue() {
      try {
        const response = await getVenue(user, id)
        if (!active) return
        setVenue(response.venue)
        setForm(toForm(response.venue))
      } catch (error) {
        if (!active) return
        if (error.status === 403) setStatus({ type: 'error', message: 'You do not have access to edit this venue.' })
        else if (error.status === 404) setStatus({ type: 'error', message: 'This venue no longer exists.' })
        else if (error.status === 401) setStatus({ type: 'error', message: 'Your session has expired. Please log in again.' })
        else setStatus({ type: 'error', message: 'We could not load this venue for editing. Please try again.' })
      } finally {
        if (active) setLoading(false)
      }
    }

    loadVenue()
    return () => {
      active = false
    }
  }, [id, user])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!venue) return

    setStatus({ type: null, message: '' })
    const payload = toPayload(form)
    const { errors: validationErrors } = normaliseVenueInput({ ...payload, name: venue.name })

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      setStatus({ type: 'error', message: 'Fix the highlighted fields before saving this venue.' })
      return
    }

    setSaving(true)
    setErrors({})
    try {
      await updateVenue(user, id, payload)
      navigate(`/venues/${id}`, { state: { updated: true } })
    } catch (error) {
      const apiErrors = error.details?.errors
      if (apiErrors) setErrors(apiErrors)
      setStatus({
        type: 'error',
        message: apiErrors
          ? 'Fix the highlighted fields before saving this venue.'
          : 'Could not update the venue. No changes were saved. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container venue-page">
        <section className="venue-heading">
          <p className="eyebrow">
            <Link to={`/venues/${id}`}>Venue details</Link>
          </p>
          <h1>{venue?.name ? `Edit ${venue.name}` : 'Edit venue'}</h1>
          <p>Update catalogue details used by staff during event planning.</p>
        </section>

        {loading && <Card><LoadingSpinner label="Loading venue" /></Card>}

        {!loading && status.message && (
          <div className={`alert ${status.type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">
            {status.message}
          </div>
        )}

        {!loading && venue && (
          <Card>
            <form className="request-form" onSubmit={handleSubmit} noValidate>
              <section className="request-form-section">
                <h2>Venue details</h2>
                <div className="venue-field-grid">
                  <Input id="venue-name" name="name" label="Venue name" value={venue.name} disabled />
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
                </div>
                <Input
                  id="venue-location"
                  name="location"
                  label="Physical location"
                  value={form.location}
                  onChange={updateField}
                  error={errors.location}
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
                  required
                />
              </section>

              <div className="form-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving changes...' : 'Save changes'}
                </Button>
                <Link className="button button-secondary" to={`/venues/${id}`}>
                  Cancel
                </Link>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  )
}

export default EditVenuePage
