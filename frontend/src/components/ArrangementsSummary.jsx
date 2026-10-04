import { arrangementRows } from '../utils/eventArrangements.js'
import Card from './Card.jsx'

// SPM-64 AC5 — the Organiser's view of their event's arrangements: date and time, venue and equipment as
// they requested them, with the sign-off state. Venue bookings and equipment reservations do not exist
// yet, so each value is labelled "Requested"; the booking stories will add what was actually secured.
// Rendered from the projected request the API already sent; the page decides who sees the card.
function ArrangementsSummary({ request, arrangements }) {
  const rows = arrangementRows(request, arrangements)

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
              <span className="value-empty">Requested: </span>
              {row.requested}
            </strong>
            {row.signOff && <p className="form-note" style={{ margin: '6px 0 0' }}>Sign-off: {row.signOff}</p>}
          </div>
        </div>
      ))}
    </Card>
  )
}

export default ArrangementsSummary
