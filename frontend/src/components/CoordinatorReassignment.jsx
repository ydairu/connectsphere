import { useState } from 'react'
import { getReassignmentCandidates, reassignCoordinator } from '../services/api.js'
import { activeEventsLabel } from '../utils/coordinatorWorkload.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

const LOAD_ERROR = 'We could not load the list of Coordinators. Please try again.'
const SAVE_ERROR = 'We could not reassign this event. Please try again.'

// SPM-26, made Lead-only by SPM-69 — the Event Coordinator Lead hands the event to another Coordinator.
// Rendered only when the API says canReassignCoordinator; the backend checks everything again. The list comes
// from the API, already limited to Coordinators the Lead may choose, each with their active events (SPM-68's
// picker); nothing is pre-selected. The Coordinator the list was loaded for is sent back, so a reassignment made
// meanwhile is refused (409): the caller is told through onStale() and should reload the event.
function CoordinatorReassignment({ user, requestId, busy, onReassigned, onStale }) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState(null)
  const [current, setCurrent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [coordinatorUid, setCoordinatorUid] = useState('')

  async function start() {
    setOpen(true)
    setError(null)
    setCoordinatorUid('')
    setLoading(true)
    try {
      const response = await getReassignmentCandidates(user, requestId)
      setCandidates(response.coordinators ?? [])
      setCurrent(response.currentCoordinator ?? null)
    } catch (loadError) {
      setCandidates(null)
      if (loadError.status === 409) {
        setOpen(false)
        onStale(loadError.details?.message)
        return
      }
      setError(loadError.details?.message ?? LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const response = await reassignCoordinator(user, requestId, { coordinatorUid, expectedCoordinatorUid: current?.uid })
      const chosen = candidates.find((candidate) => candidate.uid === coordinatorUid)
      setOpen(false)
      setSaving(false)
      onReassigned(response.coordinator?.name ?? chosen?.name ?? 'the new Coordinator')
    } catch (saveError) {
      setSaving(false)
      if (saveError.status === 409) {
        setOpen(false)
        onStale(saveError.details?.message)
        return
      }
      setError(saveError.details?.message ?? SAVE_ERROR)
    }
  }

  const disabled = busy || saving

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Reassign Coordinator</h2>
      </div>

      {!open ? (
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <Button type="button" variant="secondary" disabled={disabled} onClick={start}>
            Reassign coordinator
          </Button>
        </div>
      ) : (
        <div role="group" aria-label="Reassign coordinator">
          <p>
            Hand this event to another Event Coordinator.
            {current?.name ? ` It is currently assigned to ${current.name}.` : ''}
          </p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading && <p className="form-note">Loading Coordinators…</p>}
          {!loading && candidates?.length === 0 && (
            <p className="form-note">No other Event Coordinator is available to take this event.</p>
          )}

          {!loading && candidates?.length > 0 && (
            <div className="field">
              <label htmlFor="reassign-coordinator">New Event Coordinator</label>
              <select
                id="reassign-coordinator"
                value={coordinatorUid}
                disabled={disabled}
                onChange={(event) => setCoordinatorUid(event.target.value)}
              >
                <option value="">Choose a Coordinator</option>
                {candidates.map((candidate) => (
                  <option key={candidate.uid} value={candidate.uid}>
                    {`${candidate.name} · ${activeEventsLabel(candidate.activeEvents ?? 0)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-actions" style={{ gap: 12 }}>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              Go back
            </Button>
            {candidates?.length > 0 && (
              <Button type="button" disabled={disabled || coordinatorUid === ''} onClick={submit}>
                {saving ? 'Reassigning…' : 'Reassign event'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default CoordinatorReassignment
