import { RETURNED } from '../../../shared/status.js'
import Card from './Card.jsx'

function sentOn(at) {
  const time = Date.parse(at ?? '')
  return Number.isNaN(time) ? null : new Date(time).toLocaleString()
}

function Message({ entry }) {
  const when = sentOn(entry.requestedAt)
  return (
    <div className="profile-row">
      <span>{when ? `Sent ${when}` : 'Sent'}</span>
      <strong>{entry.message}</strong>
    </div>
  )
}

// SPM-25 — the Coordinator's clarification messages, newest first, as summarised by the API for this
// user. While the request is Returned the newest is the one to act on; earlier ones stay as history.
function ClarificationRequests({ status, entries }) {
  if (!entries?.length) return null
  const returned = status === RETURNED
  const [latest, ...earlier] = entries

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>{returned ? 'Clarification requested' : 'Clarification history'}</h2>
      </div>
      {returned ? (
        <>
          <div className="alert alert-info" role="status" aria-label="Clarification message">
            <p>{latest.message}</p>
          </div>
          {sentOn(latest.requestedAt) && <p className="form-note">Sent {sentOn(latest.requestedAt)}</p>}
          {earlier.length > 0 && <h3>Earlier messages</h3>}
          {earlier.map((entry, index) => <Message key={index} entry={entry} />)}
        </>
      ) : (
        entries.map((entry, index) => <Message key={index} entry={entry} />)
      )}
    </Card>
  )
}

export default ClarificationRequests
