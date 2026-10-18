import { arrangementRows } from '../utils/eventArrangements.js'
import Card from './Card.jsx'

// SPM-64 AC5 — the Organiser's view of their event's arrangements: date and time, venue and equipment as
// they requested them, with the sign-off state. Each value is labelled "Requested", except reserved
// equipment (SPM-62), shown as "Reserved" in place of the requested list, by type and quantity only.
// Rendered from the projected request the API already sent; the page decides who sees the card.
function ArrangementsSummary({ request, arrangements, reservedEquipment = null }) {
  const rows = arrangementRows(request, arrangements, reservedEquipment)

  return (
    <Card className="request-form-section">
      <div className="section-heading">
        <h2>Your event arrangements</h2>
      </div>
      {rows.map((row) => (
        <div className="profile-row" key={row.label} aria-label={row.label}>
          <span>{row.label}</span>
          <div>
            <strong>
              <span className="value-empty">{row.reserved ? 'Reserved: ' : 'Requested: '}</span>
              {row.reserved ?? row.requested}
            </strong>
            {row.signOff && <p className="form-note" style={{ margin: '6px 0 0' }}>Sign-off: {row.signOff}</p>}
          </div>
        </div>
      ))}
    </Card>
  )
}

export default ArrangementsSummary
