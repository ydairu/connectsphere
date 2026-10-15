import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EQUIPMENT_UNIT_STATUSES, EQUIPMENT_UNIT_STATUS_LABELS } from '../../../shared/equipment.js'
import { TECHNICAL_STAFF } from '../../../shared/permissions.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { addEquipmentUnit, getEquipmentType, updateEquipmentUnitStatus } from '../services/api.js'

function statusLabel(status) {
  return EQUIPMENT_UNIT_STATUS_LABELS[status] ?? 'Unknown'
}

// One unit. Technical Support Staff change its status here; Coordinators see it read-only.
function UnitRow({ unit, canManage, onSave }) {
  const [status, setStatus] = useState(unit.status)
  const [note, setNote] = useState(unit.statusNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const changed = status !== unit.status || note.trim() !== (unit.statusNote ?? '')

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(unit, { status, note: note.trim() || null })
    } catch {
      setError('We could not save this status. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li>
      <Card className="request-item">
        <div className="request-item-main">
          <h2>{unit.assetTag}</h2>
          <p className="request-meta">
            <span className={`status-pill equipment-status-${unit.status}`}>{statusLabel(unit.status)}</span>
            {unit.statusNote && <> {unit.statusNote}</>}
          </p>
        </div>
        {canManage && (
          <form className="request-item-actions" onSubmit={save} aria-label={`Status of ${unit.assetTag}`}>
            <div className="field">
              <label htmlFor={`unit-status-${unit.id}`}>Status</label>
              <select id={`unit-status-${unit.id}`} value={status} onChange={(event) => setStatus(event.target.value)}>
                {EQUIPMENT_UNIT_STATUSES.map((value) => (
                  <option key={value} value={value}>{statusLabel(value)}</option>
                ))}
              </select>
            </div>
            <Input
              id={`unit-note-${unit.id}`}
              label="Note (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Cracked casing"
            />
            <Button type="submit" variant="secondary" disabled={!changed || saving}>
              {saving ? 'Saving...' : 'Save status'}
            </Button>
            {error && <span className="field-error" role="alert">{error}</span>}
          </form>
        )}
      </Card>
    </li>
  )
}

function EquipmentDetailPage() {
  const { id } = useParams()
  const { user, roles } = useAuth()
  const canManage = roles.includes(TECHNICAL_STAFF)
  const [equipment, setEquipment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [assetTag, setAssetTag] = useState('')
  const [unitError, setUnitError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    try {
      const response = await getEquipmentType(user, id)
      setEquipment(response.equipment)
      setLoadError(null)
    } catch (error) {
      if (error.status === 404) setLoadError('This equipment type no longer exists.')
      else if (error.status === 403) setLoadError('You do not have access to equipment.')
      else if (error.status === 401) setLoadError('Your session has expired. Please log in again.')
      else setLoadError('We could not load this equipment. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  async function addUnit(event) {
    event.preventDefault()
    setNotice(null)
    if (!assetTag.trim()) {
      setUnitError('Required.')
      return
    }
    setAdding(true)
    setUnitError(null)
    try {
      const response = await addEquipmentUnit(user, id, { assetTag })
      setAssetTag('')
      setNotice(`Unit ${response.unit.assetTag} added as Available.`)
      await load()
    } catch (error) {
      setUnitError(error.details?.errors?.assetTag ?? 'We could not add this unit. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  async function saveStatus(unit, change) {
    await updateEquipmentUnitStatus(user, id, unit.id, change)
    setNotice(`${unit.assetTag} is now ${statusLabel(change.status)}.`)
    await load()
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="container venue-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow"><Link to="/equipment">Equipment availability</Link></span>
            <h1>{equipment?.name || (loading ? 'Loading equipment...' : 'Equipment')}</h1>
            {equipment && (
              <p>
                {equipment.availableUnits} of {equipment.totalUnits} units available.
                {equipment.location && ` Stored at ${equipment.location}.`}
              </p>
            )}
          </div>
        </div>

        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading && <Card><LoadingSpinner label="Loading equipment" /></Card>}
        {!loading && loadError && <div className="alert alert-error" role="alert">{loadError}</div>}

        {!loading && !loadError && equipment && (
          <>
            {equipment.units.length === 0 ? (
              <Card className="empty-state">
                <h2>No units yet</h2>
                <p>{canManage ? 'Add a unit below with its asset tag.' : 'Technical Support Staff have not added any units.'}</p>
              </Card>
            ) : (
              <ul className="request-list" aria-label="Units">
                {equipment.units.map((unit) => (
                  <UnitRow key={`${unit.id}-${unit.status}-${unit.statusNote ?? ''}`} unit={unit} canManage={canManage} onSave={saveStatus} />
                ))}
              </ul>
            )}

            {canManage && (
              <Card className="request-form-section">
                <h2>Add a unit</h2>
                <form onSubmit={addUnit} noValidate>
                  <Input
                    id="unit-asset-tag"
                    label="Asset tag"
                    value={assetTag}
                    onChange={(event) => setAssetTag(event.target.value)}
                    error={unitError}
                    placeholder="MIC-011"
                    required
                  />
                  <div className="form-actions">
                    <Button type="submit" disabled={adding}>{adding ? 'Adding...' : 'Add unit'}</Button>
                  </div>
                </form>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default EquipmentDetailPage
