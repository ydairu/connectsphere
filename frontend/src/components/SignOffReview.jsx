import { useState } from 'react'
import { SIGN_OFF_REVIEW_PENDING } from '../../../shared/signOffReview.js'
import { decideSignOffReview } from '../services/api.js'
import { fieldLabel } from '../utils/changeHistory.js'
import Button from './Button.jsx'
import Card from './Card.jsx'

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// SPM-87 — after a significant change, the assigned Coordinator sees the sign-offs marked "Changed since
// approval" and chooses which go back to Awaiting approval, or records that none need re-approval. `review` is
// the API's signOffReview, sent to the assigned Coordinator only; the server decides what a choice does.
function SignOffReview({ user, requestId, review, busy, onDecided }) {
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  if (!review) return null
  const pending = review.status === SIGN_OFF_REVIEW_PENDING
  const sentBack = review.items.filter((item) => (review.reapprove ?? []).includes(item.key))

  const toggle = (key) => setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))

  async function decide(keys) {
    setSaving(true)
    setError(null)
    try {
      onDecided(await decideSignOffReview(user, requestId, keys), keys.length)
      setSelected([])
    } catch (requestError) {
      setError(requestError.details?.message ?? 'We could not record your choice. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>{pending ? 'Sign-offs changed since approval' : 'Sign-off re-approval'}</h2>
      </div>
      {review.changedFields.length > 0 && (
        <p className="form-note">
          Significant change{formatDateTime(review.changedAt) ? ` on ${formatDateTime(review.changedAt)}` : ''}: {review.changedFields.map((path) => fieldLabel(path)).join(', ')}.
        </p>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {pending ? (
        <div role="group" aria-label="Choose sign-offs to send back">
          <p>These sign-offs are still approved but marked <strong>Changed since approval</strong>. Choose which need re-approval. Until you decide, the event cannot be sent for its safety check or confirmed.</p>
          {review.items.map((item) => (
            <label className="checkbox-field" key={item.key}>
              <input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} disabled={busy || saving} />
              {item.label} — Changed since approval
            </label>
          ))}
          <div className="form-actions" style={{ gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <Button type="button" disabled={busy || saving || selected.length === 0} onClick={() => decide(selected)}>
              Send selected back for re-approval
            </Button>
            <Button type="button" variant="secondary" disabled={busy || saving || selected.length > 0} onClick={() => decide([])}>
              None need re-approval
            </Button>
          </div>
        </div>
      ) : (
        <div className="profile-row">
          <span>Your choice{formatDateTime(review.decidedAt) ? ` (${formatDateTime(review.decidedAt)})` : ''}</span>
          <strong>
            {sentBack.length > 0
              ? `Sent back for re-approval: ${sentBack.map((item) => item.label).join(', ')}`
              : 'None need re-approval; the existing approvals stay valid.'}
          </strong>
        </div>
      )}
    </Card>
  )
}

export default SignOffReview
