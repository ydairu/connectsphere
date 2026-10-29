import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { registerForEvent } from '../services/api.js'
import { displayDateTime, unavailableText, venueText } from '../utils/registration.js'

// SPM-19 — an Attendee registers for an event from its page. Rendered from `attendeeRegistration` in the
// request response, which the API sends only to an Attendee who may see the event: whether they can register
// now and why not, the places left, and their registration if they have one. The API decides; a refusal on
// submit (someone took the last place first) is shown as the API words it.

function Confirmation({ registration }) {
  const when = displayDateTime(registration.eventStartsAt)
  const where = venueText(registration.venueNames)
  return (
    <div className="alert alert-success" role="status" aria-label="Registration confirmed">
      <p><strong>You are registered for {registration.eventTitle ?? 'this event'}.</strong></p>
      <ul className="value-list">
        {when && <li>Date and time: {when}</li>}
        <li>Venue: {where ?? 'To be confirmed'}</li>
      </ul>
      <p><Link to="/registrations">View my registrations</Link></p>
    </div>
  )
}

function AttendeeRegistration({ user, requestId, summary }) {
  const [registration, setRegistration] = useState(summary?.myRegistration ?? null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!summary) return null

  async function register() {
    setBusy(true)
    setRefusal(null)
    try {
      const response = await registerForEvent(user, requestId)
      setRegistration(response.registration)
    } catch (error) {
      setRefusal(error.details?.message ?? 'We could not register you. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Registration">
      <Card className="request-form-section">
        <div className="section-heading"><h2>Registration</h2></div>
        {registration ? (
          <Confirmation registration={registration} />
        ) : summary.canRegister && !refusal ? (
          <>
            <p>
              {summary.placesLeft === 1 ? '1 place left.' : `${summary.placesLeft} places left.`}
              {displayDateTime(summary.closesAt) && ` Registration closes ${displayDateTime(summary.closesAt)}.`}
            </p>
            <Button type="button" onClick={register} disabled={busy}>{busy ? 'Registering…' : 'Register'}</Button>
          </>
        ) : (
          <p className="form-note" role="status">{refusal ?? unavailableText(summary)}</p>
        )}
      </Card>
    </section>
  )
}

export default AttendeeRegistration
