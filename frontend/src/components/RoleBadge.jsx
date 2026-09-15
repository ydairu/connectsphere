import { roleLabel } from '../utils/roleLabels.js'

function RoleBadge({ role }) {
  return <span className={`role-badge role-${role}`}>{roleLabel(role).toUpperCase()}</span>
}

export default RoleBadge
