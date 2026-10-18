import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TECHNICAL_STAFF } from '../../../shared/permissions.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createEquipmentType, listEquipment } from '../services/api.js'

const EMPTY_TYPE_FORM = Object.freeze({ name: '', location: '' })
const EMPTY_PERIOD_FORM = Object.freeze({ from: '', to: '' })

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
}

function loadErrorMessage(error) {
  if (error.status === 403) return 'You do not have access to equipment.'
  if (error.status === 401) return 'Your session has expired. Please log in again.'
  return 'We could not load equipment. Please try again.'
}

// SPM-37 — the available quantity of each equipment type. Only Available units are counted; Damaged,
// Under Repair and Unavailable units are excluded for every period.
function EquipmentPage() {
  const { user, roles } = useAuth()
  const canManage = roles.includes(TECHNICAL_STAFF)
  const [equipment, setEquipment] = useState([])
  const [period, setPeriod] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [periodForm, setPeriodForm] = useState(EMPTY_PERIOD_FORM)
  const [periodErrors, setPeriodErrors] = useState({})
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM)
  const [typeErrors, setTypeErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(
    async (range) => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await listEquipment(user, range ?? {})
        setEquipment(response.equipment)
        setPeriod(response.period)
      } catch (error) {
        setLoadError(loadErrorMessage(error))
      } finally {
        setLoading(false)
      }
    },
    [user],
  )

  useEffect(() => {
    load()
  }, [load])

  function checkPeriod(event) {
    event.preventDefault()
    const errors = {}
    if (!periodForm.from) errors.from = 'Enter a start date and time.'
    if (!periodForm.to) errors.to = 'Enter an end date and time.'
    if (periodForm.from && periodForm.to && new Date(periodForm.from) >= new Date(periodForm.to)) {
      errors.to = 'The end must be after the start.'
    }
    setPeriodErrors(errors)
    if (Object.keys(errors).length > 0) return
    load({ from: new Date(periodForm.from).toISOString(), to: new Date(periodForm.to).toISOString() })
  }

  function clearPeriod() {
    setPeriodForm(EMPTY_PERIOD_FORM)
    setPeriodErrors({})
    load()
  }

  async function addType(event) {
    event.preventDefault()
    setNotice(null)
    if (!typeForm.name.trim()) {
      setTypeErrors({ name: 'Required.' })
      return
    }
    setSaving(true)
    setTypeErrors({})
    try {
      const response = await createEquipmentType(user, { name: typeForm.name, location: typeForm.location })
      setTypeForm(EMPTY_TYPE_FORM)
      setNotice(`${response.equipment.name} added. Open it to add its units.`)
      await load(period ?? undefined)
    } catch (error) {
      if (error.status === 400 && error.details?.errors) setTypeErrors(error.details.errors)
      else setTypeErrors({ form: 'We could not add this equipment type. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container venue-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Equipment</span>
            <h1>Equipment availability</h1>
            <p>
              Available units for each equipment type. Damaged, Under Repair and Unavailable units are not counted as
              available for any period. Check a period to also leave out units reserved for overlapping events.
            </p>
          </div>
        </div>

        {notice && <div className="alert alert-success" role="status">{notice}</div>}

        <Card className="request-form-section availability-controls">
          <h2>Check availability for a period</h2>
          <form onSubmit={checkPeriod} noValidate>
            <div className="field-row">
              <Input
                id="equipment-from"
                label="From"
                type="datetime-local"
                value={periodForm.from}
                onChange={(event) => setPeriodForm({ ...periodForm, from: event.target.value })}
                error={periodErrors.from}
              />
              <Input
                id="equipment-to"
                label="To"
                type="datetime-local"
                value={periodForm.to}
                onChange={(event) => setPeriodForm({ ...periodForm, to: event.target.value })}
                error={periodErrors.to}
              />
            </div>
            <div className="form-actions">
              <Button type="submit">Check availability</Button>
              {period && (
                <Button type="button" variant="secondary" onClick={clearPeriod}>
                  Clear period
                </Button>
              )}
            </div>
          </form>
          {period && (
            <p className="request-meta">
              Showing availability from {formatDateTime(period.from)} to {formatDateTime(period.to)}. Units reserved for
              events overlapping this period are not counted as available.
            </p>
          )}
        </Card>

        {loading && <Card><LoadingSpinner label="Loading equipment" /></Card>}
        {!loading && loadError && <div className="alert alert-error" role="alert">{loadError}</div>}

        {!loading && !loadError && equipment.length === 0 && (
          <Card className="empty-state">
            <h2>No equipment yet</h2>
            <p>{canManage ? 'Add an equipment type below, then add its units.' : 'Technical Support Staff have not added any equipment.'}</p>
          </Card>
        )}

        {!loading && !loadError && equipment.length > 0 && (
          <ul className="venue-list" aria-label="Equipment types">
            {equipment.map((item) => (
              <li key={item.id}>
                <Card className="venue-card">
                  <div className="venue-card-main">
                    <h2>{item.name}</h2>
                    <dl className="venue-summary-grid">
                      <div>
                        <dt>Available</dt>
                        <dd>{item.availableUnits} of {item.totalUnits}</dd>
                      </div>
                      <div>
                        <dt>Not available</dt>
                        <dd>
                          {item.unavailableUnits === 0
                            ? 'None'
                            : `${item.byStatus.damaged} damaged, ${item.byStatus.under_repair} under repair, ${item.byStatus.unavailable} unavailable${item.reservedUnits > 0 ? `, ${item.reservedUnits} reserved for overlapping events` : ''}`}
                        </dd>
                      </div>
                      {item.location && (
                        <div>
                          <dt>Location</dt>
                          <dd>{item.location}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <Link className="button button-secondary" to={`/equipment/${item.id}`} aria-label={`View units for ${item.name}`}>
                    View units
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <Card className="request-form-section">
            <h2>Add an equipment type</h2>
            <form onSubmit={addType} noValidate>
              {typeErrors.form && <div className="alert alert-error" role="alert">{typeErrors.form}</div>}
              <div className="field-row">
                <Input
                  id="equipment-name"
                  label="Equipment type"
                  value={typeForm.name}
                  onChange={(event) => setTypeForm({ ...typeForm, name: event.target.value })}
                  error={typeErrors.name}
                  placeholder="Wireless microphone"
                  required
                />
                <Input
                  id="equipment-location"
                  label="Storage location (optional)"
                  value={typeForm.location}
                  onChange={(event) => setTypeForm({ ...typeForm, location: event.target.value })}
                  error={typeErrors.location}
                  placeholder="Store room B2"
                />
              </div>
              <div className="form-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Adding...' : 'Add equipment type'}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  )
}

export default EquipmentPage
