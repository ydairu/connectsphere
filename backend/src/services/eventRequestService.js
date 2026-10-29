import { DRAFT, RETURNED, SUBMITTED } from '../../../shared/status.js'
import { RESUBMIT, SUBMIT, canTransition } from '../../../shared/statusTransitions.js'
import {
  buildDraftEventRequest,
  buildDraftEventRequestUpdate,
  hasValidationErrors,
  validateEventRequestSubmission,
} from '../../../shared/eventRequest.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { recordStatusChange, userActor } from './statusHistory.js'

export class EventRequestValidationError extends Error {
  constructor(errors) {
    super('Event request validation failed.')
    this.name = 'EventRequestValidationError'
    this.errors = errors
  }
}

export class EventRequestForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'EventRequestForbiddenError'
  }
}

export class EventRequestNotFoundError extends Error {
  constructor() {
    super('Event request not found.')
    this.name = 'EventRequestNotFoundError'
  }
}

export async function createDraftEventRequest(input, organiser, db = getAdminDb()) {
  const { request, errors } = buildDraftEventRequest(input, organiser)
  if (hasValidationErrors(errors)) throw new EventRequestValidationError(errors)

  const docRef = await db.collection('eventRequests').add(request)
  return { id: docRef.id, ...request }
}

export async function getOwnedDraftEventRequest(id, organiser, db = getAdminDb()) {
  const docRef = db.collection('eventRequests').doc(id)
  const snapshot = await docRef.get()

  if (!snapshot.exists) throw new EventRequestNotFoundError()

  const existing = snapshot.data()
  if (existing.ownerUid !== organiser.uid) throw new EventRequestForbiddenError()
  if (existing.status !== DRAFT) throw new EventRequestForbiddenError('Only unsubmitted draft requests can be opened.')

  return { id, ...existing }
}

export async function updateDraftEventRequest(id, input, organiser, db = getAdminDb()) {
  const docRef = db.collection('eventRequests').doc(id)
  const snapshot = await docRef.get()

  if (!snapshot.exists) throw new EventRequestNotFoundError()

  const existing = snapshot.data()
  if (existing.ownerUid !== organiser.uid) throw new EventRequestForbiddenError()
  if (existing.status !== DRAFT) throw new EventRequestForbiddenError('Only unsubmitted draft requests can be edited.')

  const { update, errors } = buildDraftEventRequestUpdate(input)
  if (hasValidationErrors(errors)) throw new EventRequestValidationError(errors)

  await docRef.update(update)
  return { id, ...existing, ...update }
}

// SPM-3 submit. SPM-68 (W7-CUST Change #5) replaces SPM-8's automatic assignment: a first submission is left
// with no Coordinator and enters the Event Coordinator Lead's unassigned queue. `submittedAt` records when it
// entered the queue, and is not changed by a resubmission.
// SPM-9: a Returned request is resubmitted the same way (Returned → Submitted). It keeps its Coordinator, since
// nothing here writes assignedCoordinatorUid, so it never re-enters the queue (CL3 G8!C15). Either change is
// recorded in the activity history in the same transaction.
export async function submitDraftEventRequest(id, organiser, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const docRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(docRef)

    if (!snapshot.exists) throw new EventRequestNotFoundError()

    const existing = snapshot.data()
    if (existing.ownerUid !== organiser.uid) throw new EventRequestForbiddenError()

    const action = existing.status === RETURNED ? RESUBMIT : SUBMIT
    const decision = canTransition(organiser, existing, action, now)
    if (!decision.allowed) throw new EventRequestForbiddenError('Only draft or returned requests can be submitted.')

    const { errors } = validateEventRequestSubmission(existing)
    if (hasValidationErrors(errors)) throw new EventRequestValidationError(errors)

    const update = {
      status: SUBMITTED,
      ...(action === SUBMIT ? { submittedAt: now.toISOString() } : {}),
      updatedAt: now.toISOString(),
    }

    tx.update(docRef, update)
    recordStatusChange(tx, docRef, {
      action,
      fromStatus: existing.status,
      toStatus: SUBMITTED,
      actor: userActor(organiser),
      at: now.toISOString(),
    })
    return { id, ...existing, ...update }
  })
}
