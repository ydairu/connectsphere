function RoleBadge({ role }) {
  return <span className={`role-badge role-${role}`}>{role?.toUpperCase()}</span>
}

export default RoleBadge

