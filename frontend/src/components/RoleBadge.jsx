function RoleBadge({ role }) {
  const label = role === 'organiser' ? 'Event Organiser' : 'Attendee'
  return <span className={`role-badge role-${role}`}>{label.toUpperCase()}</span>
}

export default RoleBadge
