import { useState } from 'react'
import { PLANNING } from '../../../shared/status.js'
import { CONFIRM, REJECT } from '../../../shared/statusTransitions.js'
import { actionConfirmation, actionLabel, actionReason, actionReasonLabel } from '../utils/statusActions.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

const DECISION_TEXT = { approved: 'Approved', rejected: 'Rejected' }
const CANCELLATION_TEXT = {
  pending: 'Cancellation requested — awaiting the event coordinator’s decision.',
  approved: 'Cancellation request approved.',
  refused: 'Cancellation request refused. The event remains confirmed.',
}

function ArrangementRow({ label, arrangement }) {
  const text = !arrangement.required ? 'Not required' : DECISION_TEXT[arrangement.decision] ?? 'Awaiting approval'
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  )
}

// SPM-9 — sign-off progress and any cancellation request, as summarised by the API for this user.
function StatusDetails({ arrangements, cancellationRequest }) {
  if (!arrangements && !cancellationRequest) return null
  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Arrangements and cancellation</h2>
      </div>
      {arrangements?.venue && <ArrangementRow label="Venue arrangement" arrangement={arrangements.venue} />}
      {arrangements?.technical && <ArrangementRow label="Technical arrangement" arrangement={arrangements.technical} />}
      {cancellationRequest && (
        <div className="profile-row">
          <span>{CANCELLATION_TEXT[cancellationRequest.status] ?? cancellationRequest.status}</span>
          <strong>
            {cancellationRequest.status === 'refused'
              ? cancellationRequest.decisionReason ?? ''
              : cancellationRequest.reason ?? ''}
          </strong>
        </div>
      )}
    </Card>
  )
}

// SPM-9 — the actions this user may take now. `actions` comes from the API (availableActions), so the
// page shows only what the backend will accept; the backend checks again on every action.
function StatusActions({ status, actions, arrangements, cancellationRequest, busy, onAction }) {
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')

  // The assigned Coordinator at Planning can reject but not yet confirm: say why there is no Confirm.
  const confirmBlocked = status === PLANNING && actions.includes(REJECT) && !actions.includes(CONFIRM)
  const reasonMode = pending ? actionReason(pending) : null

  function choose(action) {
    setReason('')
    if (actionConfirmation(action)) setPending(action)
    else onAction(action)
  }

  return (
    <>
      <StatusDetails arrangements={arrangements} cancellationRequest={cancellationRequest} />

      {actions.length > 0 && (
        <Card className="request-form-section">
          <div className="section-heading">
            <h2>Status actions</h2>
          </div>

          {pending ? (
            <div role="group" aria-label="Confirm status change">
              <p>{actionConfirmation(pending)}</p>
              {reasonMode && (
                <div className="field">
                  <label htmlFor="status-action-reason">{actionReasonLabel(pending)}</label>
                  <textarea id="status-action-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
                </div>
              )}
              <div className="form-actions" style={{ gap: 12 }}>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setPending(null)}>
                  Go back
                </Button>
                <Button
                  type="button"
                  disabled={busy || (reasonMode === 'required' && reason.trim() === '')}
                  onClick={() => {
                    const chosen = pending
                    setPending(null)
                    onAction(chosen, reasonMode && reason.trim() !== '' ? reason.trim() : undefined)
                  }}
                >
                  {actionLabel(pending)}
                </Button>
              </div>
            </div>
          ) : (
            <div className="form-actions" style={{ gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {actions.map((action) => (
                <Button key={action} type="button" variant="secondary" disabled={busy} onClick={() => choose(action)}>
                  {actionLabel(action)}
                </Button>
              ))}
            </div>
          )}

          {confirmBlocked && (
            <p className="form-note">The event can be confirmed once all mandatory venue and technical arrangements are approved.</p>
          )}
        </Card>
      )}
    </>
  )
}

export default StatusActions
