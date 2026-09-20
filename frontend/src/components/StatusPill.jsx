import { statusLabel } from '../utils/statusLabels.js'

// Mirrors RoleBadge: the class carries the stored value, the text carries the wording.
function StatusPill({ status }) {
  return <span className={`status-pill status-${status}`}>{statusLabel(status)}</span>
}

export default StatusPill
