import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import {
  buildDraftEventRequest,
  buildDraftEventRequestUpdate,
  hasValidationErrors,
  validateEventRequestSubmission,
} from '../../../shared/eventRequest.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

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

export async function submitDraftEventRequest(id, organiser, db = getAdminDb(), now = new Date()) {
  const docRef = db.collection('eventRequests').doc(id)
  const snapshot = await docRef.get()

  if (!snapshot.exists) throw new EventRequestNotFoundError()

  const existing = snapshot.data()
  if (existing.ownerUid !== organiser.uid) throw new EventRequestForbiddenError()
  if (existing.status !== DRAFT) throw new EventRequestForbiddenError('Only unsubmitted draft requests can be submitted.')

  const { errors } = validateEventRequestSubmission(existing)
  if (hasValidationErrors(errors)) throw new EventRequestValidationError(errors)

  const update = {
    status: SUBMITTED,
    updatedAt: now.toISOString(),
  }

  await docRef.update(update)
  return { id, ...existing, ...update }
}
