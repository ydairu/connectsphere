import { safetyStatusLabel } from '../utils/safetyReview.js'

// SPM-91 — the safety review status beside the lifecycle status pill, e.g. "Pending safety check" on an event
// that is still in Planning. Renders nothing when the event has never been submitted for review.
function SafetyStatusPill({ status }) {
  if (!status) return null
  return <span className={`safety-pill safety-status-${status}`}>{safetyStatusLabel(status)}</span>
}

export default SafetyStatusPill
