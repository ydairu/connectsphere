import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ORGANISER } from '../../../shared/permissions.js'
import { REFUSE_CANCELLATION } from '../../../shared/requestActions.js'
import { PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { APPROVE, APPROVE_CANCELLATION, CONFIRM, REJECT } from '../../../shared/statusTransitions.js'
import { useAuth } from '../hooks/useAuth.js'
import { actionConfirmation, actionLabel, actionReason, actionReasonLabel, actionReasonPrompt } from '../utils/statusActions.js'
import { signOffText } from '../utils/eventArrangements.js'
import { statusLabel } from '../utils/statusLabels.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

const CANCELLATION_TEXT = {
  pending: 'Cancellation requested — awaiting the event coordinator’s decision.',
  returned: 'Cancellation request returned — the event coordinator needs more information.',
  approved: 'Cancellation request approved.',
  refused: 'Cancellation request refused. The event remains active.',
}

// The wording is shared with the SPM-64 arrangements summary (utils/eventArrangements.js), so one page never
// shows two labels for the same sign-off.
function ArrangementRow({ label, arrangement, status }) {
  const text = signOffText(arrangement, status)
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  )
}

// SPM-9 — sign-off progress and any cancellation request, as summarised by the API for this user.
function StatusDetails({ status, arrangements, cancellationRequest }) {
  if (!arrangements && !cancellationRequest) return null
  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Arrangements and cancellation</h2>
      </div>
      {arrangements?.venue && <ArrangementRow label="Venue arrangement" arrangement={arrangements.venue} status={status} />}
      {arrangements?.technical && <ArrangementRow label="Technical arrangement" arrangement={arrangements.technical} status={status} />}
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
      {cancellationRequest?.status === 'returned' && cancellationRequest.returnMessage && (
        <div className="profile-row">
          <span>Message from the event coordinator</span>
          <strong>{cancellationRequest.returnMessage}</strong>
        </div>
      )}
    </Card>
  )
}

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// SPM-63 — why and when a Cancelled event was cancelled. Until a Notification System exists, this is how
// the Organiser and assigned staff learn the reason.
function CancellationNotice({ cancellation }) {
  if (!cancellation) return null
  const when = formatDateTime(cancellation.cancelledAt)
  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Event cancelled</h2>
      </div>
      {cancellation.requestedByOrganiser && <p className="form-note">Cancelled at the organiser’s request.</p>}
      <div className="profile-row">
        <span>Reason</span>
        <strong>{cancellation.reason ?? 'No reason recorded'}</strong>
      </div>
      {when && (
        <div className="profile-row">
          <span>Cancelled on</span>
          <strong>{when}</strong>
        </div>
      )}
    </Card>
  )
}

// SPM-45 — a Rejected request is closed: why, when and at which stage. It cannot be edited or resubmitted,
// so an Organiser who wants to pursue the event with different requirements starts a new request.
function RejectionNotice({ rejection }) {
  const { roles } = useAuth()
  if (!rejection) return null
  const when = formatDateTime(rejection.rejectedAt)
  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Request rejected</h2>
      </div>
      <p className="form-note">This request is closed. It cannot be edited or resubmitted.</p>
      <div className="profile-row">
        <span>Reason</span>
        <strong>{rejection.reason ?? 'No reason recorded'}</strong>
      </div>
      {rejection.previousStatus && (
        <div className="profile-row">
          <span>Rejected at stage</span>
          <strong>{statusLabel(rejection.previousStatus)}</strong>
        </div>
      )}
      {when && (
        <div className="profile-row">
          <span>Rejected on</span>
          <strong>{when}</strong>
        </div>
      )}
      {roles?.includes(ORGANISER) && (
        <p className="form-note">
          To pursue this event with different requirements, <Link to="/event-requests/new">create a new event request</Link>.
        </p>
      )}
    </Card>
  )
}

// SPM-27 — when a Completed event was marked complete, and by whom for Coordinators (the API decides).
function CompletionNotice({ completion }) {
  if (!completion) return null
  const when = formatDateTime(completion.completedAt)
  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Event completed</h2>
      </div>
      {when && (
        <div className="profile-row">
          <span>Marked completed on</span>
          <strong>{when}</strong>
        </div>
      )}
      {completion.completedByName !== undefined && (
        <div className="profile-row">
          <span>Marked completed by</span>
          <strong>{completion.completedByName ?? 'Unknown'}</strong>
        </div>
      )}
    </Card>
  )
}

// SPM-9 — the actions this user may take now. `actions` comes from the API (availableActions), so the
// page shows only what the backend will accept; the backend checks again on every action.
export function StatusNotices({ cancellation, rejection, completion }) {
  return <>
    <CancellationNotice cancellation={cancellation} />
    <RejectionNotice rejection={rejection} />
    <CompletionNotice completion={completion} />
  </>
}

function StatusActions({ status, actions, arrangements, cancellationRequest, busy, onAction }) {
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')

  // The assigned Coordinator at Planning can reject but not yet confirm: say why there is no Confirm.
  const confirmBlocked = status === PLANNING && actions.includes(REJECT) && !actions.includes(CONFIRM)
  // SPM-5: likewise at Under Review, when required details are missing or invalid there is no Approve.
  const approveBlocked = status === UNDER_REVIEW && actions.includes(REJECT) && !actions.includes(APPROVE)
  // SPM-47: a pending request the Coordinator may refuse but no longer approve — its event has started.
  const approveCancellationBlocked =
    cancellationRequest?.status === 'pending' && actions.includes(REFUSE_CANCELLATION) && !actions.includes(APPROVE_CANCELLATION)
  const reasonMode = pending ? actionReason(pending) : null
  const reasonMissing = reasonMode === 'required' && reason.trim() === ''

  function choose(action) {
    setReason('')
    if (actionConfirmation(action)) setPending(action)
    else onAction(action)
  }

  return (
    <>
      <StatusDetails status={status} arrangements={arrangements} cancellationRequest={cancellationRequest} />

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
                  {reasonMissing && <p className="form-note">{actionReasonPrompt(pending)}</p>}
                </div>
              )}
              <div className="form-actions" style={{ gap: 12 }}>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setPending(null)}>
                  Go back
                </Button>
                <Button
                  type="button"
                  disabled={busy || reasonMissing}
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
          {approveCancellationBlocked && (
            <p className="form-note">
              The event’s start date/time has passed, so this cancellation request can no longer be approved. You can still refuse it.
            </p>
          )}
          {approveBlocked && (
            <p className="form-note">
              The request can be approved for planning once its required details are complete and valid. Complete them below, or return it for clarification.
            </p>
          )}
        </Card>
      )}
    </>
  )
}

export default StatusActions
