import Card from './Card.jsx'

export const NOT_YET_ASSIGNED = 'Not yet assigned'
export const NAME_UNAVAILABLE = 'Assigned (name unavailable)'

// SPM-46 — the event's assigned Coordinator, as summarised by the API for an Organiser who may view the
// event (`assignedCoordinator` in the response; shape in shared/assignedCoordinator.js). The API sends
// null to everyone else and for drafts, and then nothing is rendered.
function AssignedCoordinator({ coordinator }) {
  if (!coordinator) return null
  const label = !coordinator.assigned ? NOT_YET_ASSIGNED : coordinator.name || NAME_UNAVAILABLE

  return (
    <Card className="request-form-section">
      <div className="profile-row">
        <span id="assigned-coordinator-label">Event Coordinator</span>
        <strong aria-labelledby="assigned-coordinator-label" className={coordinator.name ? undefined : 'value-empty'}>
          {label}
        </strong>
      </div>
    </Card>
  )
}

export default AssignedCoordinator
