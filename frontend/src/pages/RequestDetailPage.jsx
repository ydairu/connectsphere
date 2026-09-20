import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { DRAFT } from '../../../shared/status.js'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import StatusPill from '../components/StatusPill.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getRequest, updateRequest } from '../services/api.js'
import { buildPatch, hasChanges, toFormValues } from '../utils/requestPatch.js'
import { SECTION_ORDER, sectionFields, sectionTitle } from '../utils/requestSections.js'

// SPM-42 — one page for every role. The response carries only the sections the user may view and the
// list of sections they may edit, so this page renders what it is given: a section that is absent is
// absent because the API removed it, not because the UI hid it.
//
// Drafts are not edited here. They belong to the SPM-4 editor, per the route split in AGENTS.md §6.

function ReadOnlyValue({ type, value }) {
  if (type === 'boolean') return <strong>{value === true ? 'Yes' : 'No'}</strong>
  if (type === 'list') {
    const items = Array.isArray(value) ? value : []
    if (items.length === 0) return <strong>None</strong>
    return <ul className="value-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
  }
  if (value === null || value === undefined || value === '') return <strong className="value-empty">Not set</strong>
  return <strong>{String(value)}</strong>
}

function EditableField({ section, field, value, onChange }) {
  const id = `${section}-${field.name}`
  const update = (next) => onChange(section, field.name, next)

  if (field.type === 'boolean') {
    return (
      <label className="checkbox-field" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)} />
        {field.label}
      </label>
    )
  }

  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'textarea' || field.type === 'list' ? (
        <textarea id={id} rows={field.type === 'list' ? 4 : 3} value={value} onChange={(event) => update(event.target.value)} />
      ) : (
        <input
          id={id}
          type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'}
          value={value}
          onChange={(event) => update(event.target.value)}
        />
      )}
    </div>
  )
}

function RequestDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [editableSections, setEditableSections] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [status, setStatus] = useState(null)

  const applyResponse = useCallback((response) => {
    setRequest(response.request)
    setEditableSections(response.editableSections ?? [])
    setForm(toFormValues(response.request))
  }, [])

  useEffect(() => {
    let active = true

    async function loadRequest() {
      try {
        const response = await getRequest(user, id)
        if (active) applyResponse(response)
      } catch (error) {
        if (!active) return
        if (error.status === 403) setLoadError('You do not have access to this request.')
        else if (error.status === 404) setLoadError('This request no longer exists.')
        else if (error.status === 401) setLoadError('Your session has expired. Please log in again.')
        else setLoadError('We could not load this request. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadRequest()
    return () => {
      active = false
    }
  }, [user, id, applyResponse])

  function updateField(section, name, value) {
    setForm((current) => ({ ...current, [section]: { ...current[section], [name]: value } }))
  }

  async function handleSave(event) {
    event.preventDefault()
    const patch = buildPatch(request, form, editableSections)

    if (!hasChanges(patch)) {
      setStatus({ type: 'info', message: 'Nothing has changed yet.' })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      applyResponse(await updateRequest(user, id, patch))
      setStatus({ type: 'success', message: 'Changes saved.' })
    } catch (error) {
      // SPM-42 #7: a rejected write names the fields it rejected. Show them rather than a generic error.
      const rejected = error.details?.forbiddenFields
      setStatus({
        type: 'error',
        message: rejected?.length
          ? `You are not allowed to change: ${rejected.join(', ')}`
          : error.status === 409
            ? 'This request changed while you were editing it. Reload and try again.'
            : 'We could not save your changes. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!loading && request?.status === DRAFT) {
    return <Navigate to={`/event-requests/${id}/edit`} replace />
  }

  const visibleSections = SECTION_ORDER.filter((section) => request?.[section])
  const canEditAnything = editableSections.some((section) => visibleSections.includes(section))

  return (
    <div className="page-shell">
      <Navbar />
      <main className="request-page container">
        <div className="page-heading">
          <div>
            <span className="eyebrow"><Link to="/requests">← All requests</Link></span>
            <h1>{request?.core?.title || (loading ? 'Loading…' : 'Event request')}</h1>
            {request && <p>Reference {request.id}</p>}
          </div>
          {request && <StatusPill status={request.status} />}
        </div>

        {loading && <Card><LoadingSpinner label="Loading request" /></Card>}

        {!loading && loadError && <div className="alert alert-error" role="alert">{loadError}</div>}

        {!loading && !loadError && request && (
          <form onSubmit={handleSave}>
            {status && <div className={`alert alert-${status.type}`} role="alert">{status.message}</div>}

            {visibleSections.map((section) => {
              const editable = editableSections.includes(section)
              return (
                <Card className="request-form-section" key={section}>
                  <div className="section-heading">
                    <h2>{sectionTitle(section)}</h2>
                    {!editable && <span className="section-readonly">Read only</span>}
                  </div>
                  {sectionFields(section).map((field) =>
                    editable ? (
                      <EditableField
                        key={field.name}
                        section={section}
                        field={field}
                        value={form[section]?.[field.name] ?? ''}
                        onChange={updateField}
                      />
                    ) : (
                      <div className="profile-row" key={field.name}>
                        <span>{field.label}</span>
                        <ReadOnlyValue type={field.type} value={request[section][field.name]} />
                      </div>
                    ),
                  )}
                </Card>
              )
            })}

            {canEditAnything ? (
              <div className="form-actions">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </div>
            ) : (
              <p className="form-note">You can view this request but cannot change it.</p>
            )}
          </form>
        )}
      </main>
    </div>
  )
}

export default RequestDetailPage
