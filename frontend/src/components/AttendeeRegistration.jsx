import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { acceptInvitation, declineInvitation, joinWaitingList, leaveWaitingList, registerForEvent, withdrawRegistration } from '../services/api.js'
import { DECLINED, INVITATION_EXPIRED, INVITED, REGISTERED, WAITLISTED, WITHDRAWN } from '../../../shared/registration.js'
import { displayDateTime, unavailableText, venueText } from '../utils/registration.js'

// SPM-19 — an Attendee registers for an event from its page. Rendered from `attendeeRegistration` in the
// request response, which the API sends only to an Attendee who may see the event: whether they can register
// now and why not, the places left, and their registration if they have one. The API decides; a refusal on
// submit (someone took the last place first) is shown as the API words it.
//
// SPM-39 — when the event is full and registration is open (canJoinWaitingList), the Attendee is offered the
// waiting list instead, confirms joining, and is told their position.
//
// SPM-59 — a registered Attendee withdraws where the Organiser allows it (canWithdraw), after confirming; a
// waitlisted one may leave the list; an invited one accepts or declines the place held for them before the
// deadline (canRespondToInvitation). Withdrawn, declined and lapsed Attendees may register or join again.

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

// A short message after the Attendee gave up a place or an invitation.
const ENDED = Object.freeze({
  [WITHDRAWN]: { label: 'Registration withdrawn', text: (title) => `You have withdrawn from ${title}.` },
  left: { label: 'Left the waiting list', text: () => 'You have left the waiting list.' },
  [DECLINED]: { label: 'Invitation declined', text: () => 'You declined the place. The place has passed to the next person.' },
  [INVITATION_EXPIRED]: { label: 'Invitation expired', text: () => 'Your invitation expired and the place passed to the next person.' },
})

// A two-step action: the button, then a confirmation with Confirm and Cancel.
function ConfirmStep({ label, groupLabel, prompt, busy, onConfirm }) {
  const [open, setOpen] = useState(false)
  if (!open) return <Button type="button" variant="secondary" onClick={() => setOpen(true)}>{label}</Button>
  return (
    <div role="group" aria-label={groupLabel}>
      <p>{prompt}</p>
      <div className="form-actions">
        <Button type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : 'Confirm'}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
      </div>
    </div>
  )
}

function AttendeeRegistration({ user, requestId, summary }) {
  const [registration, setRegistration] = useState(summary?.myRegistration ?? null)
  // What the Attendee just did, when it ended their place or invitation: shown instead of the usual options.
  const [ended, setEnded] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmingWaitlist, setConfirmingWaitlist] = useState(false)
  if (!summary) return null

  async function submit(request, failure, endedAs = null) {
    setBusy(true)
    setRefusal(null)
    try {
      const response = await request(user, requestId)
      setRegistration(response.registration)
      setEnded(endedAs)
    } catch (error) {
      setRefusal(error.details?.message ?? failure)
    } finally {
      setBusy(false)
      setConfirmingWaitlist(false)
    }
  }

  const status = registration?.status
  const title = registration?.eventTitle ?? 'this event'
  // Options are offered from the summary only while nothing has changed on this page since it loaded.
  const fresh = registration === (summary.myRegistration ?? null)

  let body
  if (ended) {
    body = <p className="alert alert-info" role="status" aria-label={ENDED[ended].label}>{ENDED[ended].text(title)}</p>
  } else if (refusal) {
    body = <p className="form-note" role="status">{refusal}</p>
  } else if (status === REGISTERED) {
    body = (
      <>
        <Confirmation registration={registration} />
        {fresh && summary.canWithdraw && (
          <ConfirmStep
            label="Withdraw registration"
            groupLabel="Confirm withdrawal"
            prompt="Withdraw your registration? Your place will be released and offered to the next person waiting."
            busy={busy}
            onConfirm={() => submit(withdrawRegistration, 'We could not withdraw your registration. Please try again.', WITHDRAWN)}
          />
        )}
      </>
    )
  } else if (status === INVITED && fresh && summary.canRespondToInvitation) {
    body = (
      <>
        <div className="alert alert-info" role="status" aria-label="Invitation">
          <p><strong>A place is available. Accept it by {displayDateTime(registration.invitationExpiresAt)}, or it passes to the next person.</strong></p>
        </div>
        <div className="form-actions">
          <Button type="button" onClick={() => submit(acceptInvitation, 'We could not accept the place. Please try again.')} disabled={busy}>Accept place</Button>
          <Button type="button" variant="secondary" onClick={() => submit(declineInvitation, 'We could not decline the place. Please try again.', DECLINED)} disabled={busy}>Decline</Button>
        </div>
      </>
    )
  } else if (status === WAITLISTED) {
    body = (
      <>
        <WaitingListPosition position={registration.waitingListPosition ?? summary.waitingListPosition} />
        <ConfirmStep
          label="Leave waiting list"
          groupLabel="Confirm leaving the waiting list"
          prompt="Leave the waiting list? You will lose your place in the queue."
          busy={busy}
          onConfirm={() => submit(leaveWaitingList, 'We could not remove you from the waiting list. Please try again.', 'left')}
        />
      </>
    )
  } else {
    // No record, or one that ended (withdrawn, declined, lapsed): the usual options, if any.
    const previous = fresh && ENDED[status] ? <p className="form-note">{ENDED[status].text(title)}</p> : null
    body = (
      <>
        {previous}
        {summary.canRegister ? (
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
      </>
    )
  }

  return (
    <section aria-label="Registration">
      <Card className="request-form-section">
        <div className="section-heading"><h2>Registration</h2></div>
        {body}
      </Card>
    </section>
  )
}

export default AttendeeRegistration
