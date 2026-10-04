import { useEffect, useState } from 'react'
import { getRequestHistory } from '../services/api.js'
import { fieldLabel, formatHistoryTime, formatHistoryValue } from '../utils/changeHistory.js'
import { roleLabel } from '../utils/roleLabels.js'
import Card from './Card.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'

// SPM-28 — the event's field change history, newest first, as GET /api/requests/:id/history returns it for
// this user. Rendered only when the API says canViewChangeHistory; the API also refuses everyone else, and
// leaves out internal planning changes for the Organiser. `refreshKey` changes after a save, so a new
// entry appears without reloading the page.
function ChangeHistory({ user, requestId, refreshKey }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    getRequestHistory(user, requestId)
      .then((response) => {
        if (!active) return
        setEntries(response.entries ?? [])
        setError(null)
      })
      .catch(() => {
        if (active) setError('We could not load the change history. Please try again.')
      })
    return () => {
      active = false
    }
  }, [user, requestId, refreshKey])

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Change history</h2>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!error && entries === null && <LoadingSpinner label="Loading change history" />}
      {!error && entries?.length === 0 && <p className="form-note">No changes recorded yet.</p>}
      {!error && entries?.length > 0 && (
        <ol className="value-list" aria-label="Change history entries" style={{ listStyle: 'none', padding: 0 }}>
          {entries.map((entry, index) => (
            <li key={entry.id ?? index} className="profile-row" aria-label={fieldLabel(entry.field)}>
              <span>{formatHistoryTime(entry.at)}</span>
              <div>
                <strong>{fieldLabel(entry.field)}</strong>
                <p style={{ margin: '6px 0 0' }}>
                  <span className="value-empty">{formatHistoryValue(entry.field, entry.oldValue)}</span>
                  {' → '}
                  <span>{formatHistoryValue(entry.field, entry.newValue)}</span>
                </p>
                <p className="form-note" style={{ margin: '6px 0 0' }}>
                  {entry.actor?.name ?? 'Unknown user'}
                  {entry.actor?.role ? ` (${roleLabel(entry.actor.role)})` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export default ChangeHistory
