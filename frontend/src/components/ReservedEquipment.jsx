import Card from './Card.jsx'

// SPM-58 — the event's reserved equipment items and quantities, listed with its equipment section. Rendered
// from `reservedEquipment` in the request response (types and quantities only, never unit ids), which the API
// sends to anyone who may view the equipment section; nothing is shown when nothing is reserved.

const displayTime = (value) =>
  !value || Number.isNaN(Date.parse(value)) ? null : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function ReservedEquipment({ reservedEquipment }) {
  const items = Array.isArray(reservedEquipment?.items) ? reservedEquipment.items : []
  if (items.length === 0) return null
  const reservedAt = displayTime(reservedEquipment.reservedAt)

  return (
    <section aria-label="Reserved equipment">
      <Card className="request-form-section">
        <div className="section-heading"><h2>Reserved equipment</h2></div>
        <ul className="value-list">
          {items.map((item) => <li key={item.equipmentTypeName}>{`${item.quantity} × ${item.equipmentTypeName}`}</li>)}
        </ul>
        {reservedAt && <p className="form-note">Reserved {reservedAt}</p>}
      </Card>
    </section>
  )
}

export default ReservedEquipment
