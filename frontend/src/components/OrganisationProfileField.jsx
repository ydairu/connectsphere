import { useState } from 'react'
import { organisationNameError } from '../../../shared/userProfile.js'
import Button from './Button.jsx'
import Input from './Input.jsx'

function OrganisationProfileField({ organisationName, onSave }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function startEditing() {
    setName(organisationName || '')
    setError('')
    setSaved(false)
    setEditing(true)
  }

  async function handleSave(event) {
    event.preventDefault()
    if (saving) return
    const validationError = organisationNameError(name)
    setError(validationError)
    if (validationError) return

    setSaving(true)
    try {
      await onSave(name.trim())
      setEditing(false)
      setSaved(true)
    } catch (saveError) {
      setError(saveError.details?.errors?.organisationName
        || (saveError.status === 401 ? 'Your session has expired. Please log in again.'
          : 'Could not save your organisation name. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-row">
      <span>Organisation</span>
      <div className="organisation-profile">
        {editing ? (
          <form onSubmit={handleSave} noValidate aria-busy={saving}>
            <Input id="profileOrganisationName" name="organisationName" label="Organisation name" autoComplete="organization" value={name} onChange={(event) => setName(event.target.value)} required disabled={saving} />
            {error && <div className="alert" role="alert">{error}</div>}
            <div className="organisation-actions">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="organisation-value">
              <strong>{organisationName || 'Not provided'}</strong>
              <Button type="button" variant="secondary" className="button-small" aria-label="Edit organisation name" onClick={startEditing}>Edit</Button>
            </div>
            {saved && <p className="organisation-saved" role="status">Organisation name saved.</p>}
          </>
        )}
      </div>
    </div>
  )
}

export default OrganisationProfileField
