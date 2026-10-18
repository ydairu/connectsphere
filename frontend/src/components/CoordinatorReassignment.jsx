import { useState } from 'react'
import { getReassignmentCandidates, reassignCoordinator } from '../services/api.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

const LOAD_ERROR = 'We could not load the list of Coordinators. Please try again.'
const SAVE_ERROR = 'We could not reassign this event. Please try again.'

// SPM-26 — the assigned Coordinator hands the event to another Coordinator after agreeing it offline.
// Rendered only when the API says canReassignCoordinator; the backend checks everything again. The list
// comes from the API, already limited to other Coordinators. On success the caller is told who now has the
// event — this user has lost access to it (SPM-65) — and should leave the page.
function CoordinatorReassignment({ user, requestId, busy, onReassigned }) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [coordinatorUid, setCoordinatorUid] = useState('')
  const [agreed, setAgreed] = useState(false)

  async function start() {
    setOpen(true)
    setError(null)
    setCoordinatorUid('')
    setAgreed(false)
    setLoading(true)
    try {
      const response = await getReassignmentCandidates(user, requestId)
      setCandidates(response.coordinators ?? [])
    } catch (loadError) {
      setCandidates(null)
      setError(loadError.details?.message ?? LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const response = await reassignCoordinator(user, requestId, { coordinatorUid, handoverAgreed: agreed })
      const chosen = candidates.find((candidate) => candidate.uid === coordinatorUid)
      onReassigned(response.coordinator?.name ?? chosen?.name ?? 'the new Coordinator')
    } catch (saveError) {
      setError(saveError.details?.message ?? SAVE_ERROR)
      setSaving(false)
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
          <p>Hand this event to another Event Coordinator. You will no longer see it once it is reassigned.</p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading && <p className="form-note">Loading Coordinators…</p>}
          {!loading && candidates?.length === 0 && (
            <p className="form-note">No other Event Coordinator is available to take this event.</p>
          )}

          {!loading && candidates?.length > 0 && (
            <>
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
                    <option key={candidate.uid} value={candidate.uid}>{candidate.name}</option>
                  ))}
                </select>
              </div>
              <label className="checkbox-field" htmlFor="reassign-agreed">
                <input
                  id="reassign-agreed"
                  type="checkbox"
                  checked={agreed}
                  disabled={disabled}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                The handover was agreed with the new Coordinator outside the system
              </label>
            </>
          )}

          <div className="form-actions" style={{ gap: 12 }}>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              Go back
            </Button>
            {candidates?.length > 0 && (
              <Button type="button" disabled={disabled || coordinatorUid === '' || !agreed} onClick={submit}>
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
