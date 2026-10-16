import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { CONFIRMED, DRAFT, PLANNING } from '../../../shared/status.js'
import { CANCELLATION_REQUEST_OPEN, SIGNIFICANT_FIELDS, significantFieldsIn } from '../../../shared/significantChanges.js'
import ArrangementsSummary from '../components/ArrangementsSummary.jsx'
import AssignedCoordinator from '../components/AssignedCoordinator.jsx'
import ChangeHistory from '../components/ChangeHistory.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ClarificationRequests from '../components/ClarificationRequests.jsx'
import CoordinatorReassignment from '../components/CoordinatorReassignment.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Navbar from '../components/Navbar.jsx'
import StatusActions from '../components/StatusActions.jsx'
import StatusPill from '../components/StatusPill.jsx'
import VenueSuitability from '../components/VenueSuitability.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getRequest, transitionRequest, updateRequest } from '../services/api.js'
import { statusLabel } from '../utils/statusLabels.js'
import { fieldLabel } from '../utils/changeHistory.js'
import { buildPatch, hasChanges, toFormValues, withSavedValues } from '../utils/requestPatch.js'
import { SECTION_ORDER, optionLabel, preparationReadOnlyText, sectionFields, sectionTitle } from '../utils/requestSections.js'

// SPM-42 — one page for every role. The response carries only the sections the user may view and the
// list of sections they may edit, so this page renders what it is given: a section that is absent is
// absent because the API removed it, not because the UI hid it.
//
// Drafts are not edited here. They belong to the SPM-4 editor, per the route split in AGENTS.md §6.
//
// SPM-9: the status is shown in the heading, and the status actions this user may take (availableActions
// in the response) are offered above the sections.
//
// SPM-63: a Cancelled event shows its cancellation reason and time (cancellation in the response).
// SPM-45: a Rejected request shows its rejection reason and that it is closed (rejection); SPM-27: a
// Completed event shows when it was marked complete (completion).
//
// SPM-25: the Coordinator's clarification messages (clarificationRequests in the response) are shown
// first, so a returned request's Organiser reads what to amend before editing.
//
// SPM-26: the assigned Coordinator can hand the event to another Coordinator (canReassignCoordinator in the
// response). They lose access to it at once (SPM-65), so on success they are taken to their list.
// SPM-46: an Organiser sees the event's assigned Coordinator (assignedCoordinator in the response) above
// everything else. The API sends only the name, and null to other roles.
// SPM-64: below it, an Organiser sees their event's arrangements — date and time, venue and equipment as
// requested, with the sign-off state. Every value shown is already in the response; the role check only
// decides where the summary appears, other roles see the same data in the sections.
// SPM-64 follow-up: an Organiser who opens a same-organisation colleague's request is told whose it is and
// that it is view-only (ownerName / isOwnRequest in the response, sent only to Organisers).
// SPM-28: the assigned Coordinator and the owning Organiser see the field change history at the end of the
// page (canViewChangeHistory in the response); it reloads after a save.
// SPM-48: assigned Venue Staff and Technical Support Staff see their preparation card (venuePreparation /
// equipmentPreparation in the request), editable only while editableSections says so; otherwise it says
// why (preparation in the response). The assigned Coordinator sees both read-only. The API sends neither to
// an Organiser or Attendee, so they see nothing new.
// SPM-10: saving a significant field (shared/significantChanges.js) on a Planning or Confirmed event first
// asks for confirmation on the page: the sign-offs will reset and a Confirmed event will move back to
// Planning. The server decides all of it; the page only explains it, then shows the response.
// A refused save: an invalid value (400) keeps all input and shows each error next to its field; a
// significant change while a cancellation request is open (409, AC7) puts the significant fields back to
// their saved values and keeps unsaved ordinary edits; a stale write (409) reloads the latest record.
// Nothing is saved again automatically.

function ReadOnlyValue({ field, value }) {
  const { type } = field
  if (type === 'select') value = optionLabel(field, value)
  if (type === 'boolean') return <strong>{value === true ? 'Yes' : 'No'}</strong>
  if (type === 'list') {
    const items = Array.isArray(value) ? value : []
    if (items.length === 0) return <strong>None</strong>
    return <ul className="value-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
  }
  if (value === null || value === undefined || value === '') return <strong className="value-empty">Not set</strong>
  return <strong>{String(value)}</strong>
}

function EditableField({ section, field, value, onChange, error }) {
  const id = `${section}-${field.name}`
  const update = (next) => onChange(section, field.name, next)
  // SPM-10: a server-side validation error for this field, shown beside it (as the draft form's Input does).
  const errorProps = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined }
  const errorText = error && <span className="field-error" id={`${id}-error`}>{error}</span>

  if (field.type === 'boolean') {
    const checkbox = (
      <label className="checkbox-field" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)} {...errorProps} />
        {field.label}
      </label>
    )
    // Unchanged layout unless there is an error to show under it.
    return error ? <div className="field">{checkbox}{errorText}</div> : checkbox
  }

  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'select' ? (
        <select id={id} value={value} onChange={(event) => update(event.target.value)} {...errorProps}>
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.type === 'textarea' || field.type === 'list' ? (
        <textarea
          id={id}
          rows={field.type === 'list' ? 4 : 3}
          maxLength={field.maxLength}
          value={value}
          onChange={(event) => update(event.target.value)}
          {...errorProps}
        />
      ) : (
        <input
          id={id}
          type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'}
          value={value}
          onChange={(event) => update(event.target.value)}
          {...errorProps}
        />
      )}
      {errorText}
    </div>
  )
}

function RequestDetailPage() {
  const { id } = useParams()
  const { user, roles } = useAuth()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [editableSections, setEditableSections] = useState([])
  const [availableActions, setAvailableActions] = useState([])
  const [arrangements, setArrangements] = useState(null)
  const [cancellationRequest, setCancellationRequest] = useState(null)
  const [clarificationRequests, setClarificationRequests] = useState(null)
  const [canReassign, setCanReassign] = useState(false)
  const [canCheckSuitability, setCanCheckSuitability] = useState(false)
  const [assignedCoordinator, setAssignedCoordinator] = useState(null)
  const [cancellation, setCancellation] = useState(null)
  const [rejection, setRejection] = useState(null)
  const [completion, setCompletion] = useState(null)
  const [canViewHistory, setCanViewHistory] = useState(false)
  const [owner, setOwner] = useState(null)
  const [preparation, setPreparation] = useState(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [acting, setActing] = useState(false)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [status, setStatus] = useState(null)
  const [pendingSignificant, setPendingSignificant] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const applyResponse = useCallback((response) => {
    setRequest(response.request)
    setEditableSections(response.editableSections ?? [])
    setAvailableActions(response.availableActions ?? [])
    setArrangements(response.arrangements ?? null)
    setCancellationRequest(response.cancellationRequest ?? null)
    setClarificationRequests(response.clarificationRequests ?? null)
    setCanReassign(response.canReassignCoordinator === true)
    setCanCheckSuitability(response.canCheckVenueSuitability === true)
    setAssignedCoordinator(response.assignedCoordinator ?? null)
    setCancellation(response.cancellation ?? null)
    setRejection(response.rejection ?? null)
    setCompletion(response.completion ?? null)
    setCanViewHistory(response.canViewChangeHistory === true)
    setPreparation(response.preparation ?? null)
    setOwner(typeof response.isOwnRequest === 'boolean' ? { name: response.ownerName ?? null, isOwn: response.isOwnRequest } : null)
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
    // An error stays beside a field until the user changes that field or saves again.
    setFieldErrors((current) => {
      if (!current[`${section}.${name}`]) return current
      const { [`${section}.${name}`]: _cleared, ...rest } = current
      return rest
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    const patch = buildPatch(request, form, editableSections)

    if (!hasChanges(patch)) {
      setStatus({ type: 'info', message: 'Nothing has changed yet.' })
      return
    }

    // SPM-10: a significant change on a Planning or Confirmed event is confirmed on the page first.
    const significant = significantFieldsIn(patch)
    if (significant.length > 0 && [PLANNING, CONFIRMED].includes(request.status)) {
      setStatus(null)
      setPendingSignificant({ fields: significant, status: request.status })
      return
    }

    await save(patch)
  }

  async function confirmSignificantSave() {
    setPendingSignificant(null)
    await save(buildPatch(request, form, editableSections))
  }

  async function save(patch) {
    setSaving(true)
    setStatus(null)
    setFieldErrors({})
    try {
      applyResponse(await updateRequest(user, id, patch))
      setHistoryVersion((version) => version + 1)
      setStatus({ type: 'success', message: 'Changes saved.' })
    } catch (error) {
      await handleRefusedSave(error)
    } finally {
      setSaving(false)
    }
  }

  async function handleRefusedSave(error) {
    // SPM-42 #7: a rejected write names the fields it rejected. Show them rather than a generic error.
    const rejected = error.details?.forbiddenFields
    if (rejected?.length) {
      setStatus({ type: 'error', message: `You are not allowed to change: ${rejected.join(', ')}` })
      return
    }

    // SPM-10 AC7: the significant fields go back to their saved values; unsaved ordinary edits stay.
    if (error.status === 409 && error.details?.reason === CANCELLATION_REQUEST_OPEN) {
      setForm((current) => withSavedValues(current, request, SIGNIFICANT_FIELDS))
      setStatus({
        type: 'error',
        message: `${error.details.message ?? ''} Your significant changes were undone. Other edits are still unsaved.`.trim(),
      })
      return
    }

    // SPM-10 AC6: all input is kept; each error is shown beside its field, and summarised above.
    const invalid = error.status === 400 && error.details?.errors ? error.details.errors : null
    if (invalid && Object.keys(invalid).length > 0) {
      setFieldErrors(invalid)
      setStatus({
        type: 'error',
        message: `Please correct: ${Object.entries(invalid).map(([path, problem]) => `${fieldLabel(path)} — ${problem}`).join('; ')}`,
      })
      return
    }

    // Stale write: someone else saved first. Load the latest record into the form.
    if (error.status === 409) {
      const message = 'This request changed while you were editing it. The latest version has been loaded; make your changes again.'
      try {
        applyResponse(await getRequest(user, id))
        setHistoryVersion((version) => version + 1)
        setStatus({ type: 'error', message })
      } catch {
        setStatus({ type: 'error', message: 'This request changed while you were editing it. Reload the page and try again.' })
      }
      return
    }

    setStatus({ type: 'error', message: 'We could not save your changes. Please try again.' })
  }

  async function handleAction(action, reason) {
    setActing(true)
    setStatus(null)
    try {
      const response = await transitionRequest(user, id, action, reason)
      const statusChanged = response.request.status !== request.status
      applyResponse(response)
      setStatus({
        type: 'success',
        message: statusChanged ? `Status changed to ${statusLabel(response.request.status)}.` : 'Your decision has been recorded.',
      })
    } catch (error) {
      // A resubmission is validated like a submission: name the missing fields.
      const missing = error.status === 400 && error.details?.errors ? Object.keys(error.details.errors) : []
      setStatus({
        type: 'error',
        message: missing.length
          ? `Complete these fields before resubmitting: ${missing.join(', ')}`
          : error.details?.message ?? 'We could not change the status. Please try again.',
      })
    } finally {
      setActing(false)
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

            {roles?.includes(ORGANISER) && owner?.isOwn === false && (
              <div className="alert alert-info" role="note">
                This request was submitted by {owner.name ?? 'a colleague'} from your organisation. You can view it but not edit it.
              </div>
            )}

            <AssignedCoordinator coordinator={assignedCoordinator} />
            {(roles?.includes(COORDINATOR) || roles?.includes(VENUE_STAFF)) && <p><Link to={`/requests/${id}/venue-bookings`}>Venue booking requests</Link></p>}

            {roles?.includes(ORGANISER) && <ArrangementsSummary request={request} arrangements={arrangements} />}

            <ClarificationRequests status={request.status} entries={clarificationRequests} />

            <StatusActions
              status={request.status}
              actions={availableActions}
              arrangements={arrangements}
              cancellationRequest={cancellationRequest}
              cancellation={cancellation}
              rejection={rejection}
              completion={completion}
              busy={acting || saving}
              onAction={handleAction}
            />

            {canReassign && (
              <CoordinatorReassignment
                user={user}
                requestId={id}
                busy={acting || saving}
                onReassigned={(name) => navigate('/requests', { replace: true, state: { notice: `Event reassigned to ${name}.` } })}
              />
            )}

            {canCheckSuitability && (
              <VenueSuitability
                user={user}
                request={request}
                busy={acting || saving}
                onRequirementsSaved={(response) => {
                  applyResponse(response)
                  setHistoryVersion((version) => version + 1)
                }}
              />
            )}

            {visibleSections.map((section) => {
              const editable = editableSections.includes(section)
              const readOnlyReason = editable ? null : preparationReadOnlyText(section, preparation?.[section]?.readOnlyReason)
              return (
                <Card className="request-form-section" key={section}>
                  <div className="section-heading">
                    <h2>{sectionTitle(section)}</h2>
                    {!editable && <span className="section-readonly">Read only</span>}
                  </div>
                  {readOnlyReason && <p className="form-note">{readOnlyReason}</p>}
                  {sectionFields(section).map((field) =>
                    editable ? (
                      <EditableField
                        key={field.name}
                        section={section}
                        field={field}
                        value={form[section]?.[field.name] ?? ''}
                        onChange={updateField}
                        error={fieldErrors[`${section}.${field.name}`]}
                      />
                    ) : (
                      <div className="profile-row" key={field.name}>
                        <span>{field.label}</span>
                        <ReadOnlyValue field={field} value={request[section][field.name]} />
                      </div>
                    ),
                  )}
                </Card>
              )
            })}

            {pendingSignificant && (
              <div className="significant-confirmation" role="alertdialog" aria-labelledby="significant-confirmation-title" aria-describedby="significant-confirmation-text">
                <h2 id="significant-confirmation-title">Confirm significant change</h2>
                <p id="significant-confirmation-text">
                  You changed {pendingSignificant.fields.map((path) => fieldLabel(path)).join(', ')}. Saving resets the venue and technical
                  sign-offs to Awaiting approval
                  {pendingSignificant.status === CONFIRMED
                    ? ' and moves the event back to Planning. It cannot be confirmed again until both sign-offs are approved.'
                    : '. The event cannot be confirmed until both sign-offs are approved again.'}{' '}
                  Assigned venue and technical staff will be notified.
                </p>
                <div className="form-actions">
                  <Button type="button" onClick={confirmSignificantSave} disabled={saving}>Save and reset sign-offs</Button>
                  <Button type="button" variant="secondary" onClick={() => setPendingSignificant(null)} disabled={saving}>Keep editing</Button>
                </div>
              </div>
            )}

            {canEditAnything ? (
              <div className="form-actions">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </div>
            ) : (
              <p className="form-note">You can view this request but cannot change it.</p>
            )}

            {canViewHistory && <ChangeHistory user={user} requestId={id} refreshKey={historyVersion} />}
          </form>
        )}
      </main>
    </div>
  )
}

export default RequestDetailPage
