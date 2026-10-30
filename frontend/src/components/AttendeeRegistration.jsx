import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { joinWaitingList, registerForEvent } from '../services/api.js'
import { WAITLISTED } from '../../../shared/registration.js'
import { displayDateTime, unavailableText, venueText } from '../utils/registration.js'

// SPM-19 — an Attendee registers for an event from its page. Rendered from `attendeeRegistration` in the
// request response, which the API sends only to an Attendee who may see the event: whether they can register
// now and why not, the places left, and their registration if they have one. The API decides; a refusal on
// submit (someone took the last place first) is shown as the API words it.
//
// SPM-39 — when the event is full and registration is open (canJoinWaitingList), the Attendee is offered the
// waiting list instead, confirms joining, and is told their position. They are invited, never registered
// automatically, if a place becomes available (SPM-59).

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

function WaitingListPosition({ position }) {
  return (
    <div className="alert alert-info" role="status" aria-label="On the waiting list">
      <p><strong>{position ? `You are number ${position} on the waiting list.` : 'You are on the waiting list.'}</strong></p>
      <p>You will be invited to register if a place becomes available.</p>
      <p><Link to="/registrations">View my registrations</Link></p>
    </div>
  )
}

function AttendeeRegistration({ user, requestId, summary }) {
  const [registration, setRegistration] = useState(summary?.myRegistration ?? null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmingWaitlist, setConfirmingWaitlist] = useState(false)
  if (!summary) return null

  async function submit(request, failure) {
    setBusy(true)
    setRefusal(null)
    try {
      const response = await request(user, requestId)
      setRegistration(response.registration)
    } catch (error) {
      setRefusal(error.details?.message ?? failure)
    } finally {
      setBusy(false)
      setConfirmingWaitlist(false)
    }
  }

  const waitlisted = registration?.status === WAITLISTED

  return (
    <section aria-label="Registration">
      <Card className="request-form-section">
        <div className="section-heading"><h2>Registration</h2></div>
        {waitlisted ? (
          <WaitingListPosition position={registration.waitingListPosition ?? summary.waitingListPosition} />
        ) : registration ? (
          <Confirmation registration={registration} />
        ) : refusal ? (
          <p className="form-note" role="status">{refusal}</p>
        ) : summary.canRegister ? (
          <>
            <p>
              {summary.placesLeft === 1 ? '1 place left.' : `${summary.placesLeft} places left.`}
              {displayDateTime(summary.closesAt) && ` Registration closes ${displayDateTime(summary.closesAt)}.`}
            </p>
            <Button type="button" onClick={() => submit(registerForEvent, 'We could not register you. Please try again.')} disabled={busy}>
              {busy ? 'Registering…' : 'Register'}
            </Button>
          </>
        ) : summary.canJoinWaitingList ? (
          <>
            <p className="form-note" role="status">{unavailableText(summary)}</p>
            {confirmingWaitlist ? (
              <div role="group" aria-label="Confirm joining the waiting list">
                <p>Join the waiting list? You will be invited to register if a place becomes available, in the order people joined.</p>
                <div className="form-actions">
                  <Button type="button" onClick={() => submit(joinWaitingList, 'We could not add you to the waiting list. Please try again.')} disabled={busy}>
                    {busy ? 'Joining…' : 'Confirm'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirmingWaitlist(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button type="button" onClick={() => setConfirmingWaitlist(true)}>Join waiting list</Button>
            )}
          </>
        ) : (
          <p className="form-note" role="status">{unavailableText(summary)}</p>
        )}
      </Card>
    </section>
  )
}

export default AttendeeRegistration
