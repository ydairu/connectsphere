import { registrationSettingsErrors } from './registration.js'
import { DRAFT } from './status.js'

const MAX_SHORT_TEXT_LENGTH = 160
const MAX_LONG_TEXT_LENGTH = 2000

function textOrNull(value, maxLength = MAX_LONG_TEXT_LENGTH) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string') return { error: 'Must be text.' }

  const trimmed = value.trim()
  if (!trimmed) return { value: null }
  if (trimmed.length > maxLength) return { error: `Must be ${maxLength} characters or fewer.` }
  return { value: trimmed }
}

function positiveIntegerOrNull(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) return { error: 'Must be a positive whole number.' }
  return { value: number }
}

function positiveNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return { error: 'Must be a positive number.' }
  return { value: number }
}

function dateTimeOrNull(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  if (typeof value !== 'string') return { error: 'Must be a date/time value.' }
  if (Number.isNaN(Date.parse(value))) return { error: 'Must be a valid date/time.' }
  return { value }
}

function booleanOrFalse(value) {
  return value === true
}

function stringList(value) {
  if (value === undefined || value === null || value === '') return { value: [] }
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    return { value: items }
  }
  if (typeof value === 'string') {
    return { value: value.split('\n').map((item) => item.trim()).filter(Boolean) }
  }
  return { error: 'Must be text or a list of text values.' }
}

function collect(errors, path, result) {
  if (result.error) errors[path] = result.error
  return result.value
}

// SPM-19: the registration period and capacity, set by the Organiser. How they relate to each other, the event
// start and the venue capacity is checked by registrationSettingsErrors() in shared/registration.js.
const REGISTRATION_SETTINGS = Object.freeze({
  opensAt: dateTimeOrNull,
  closesAt: dateTimeOrNull,
  capacity: positiveIntegerOrNull,
})

/**
 * The registration settings present in `input`, normalised, with errors keyed 'registration.<field>'. Only the
 * fields given are returned, so a partial section edit (PATCH /api/requests/:id) can be checked on its own.
 */
export function normaliseRegistrationSettings(input = {}) {
  const errors = {}
  const value = {}
  for (const [field, normalise] of Object.entries(REGISTRATION_SETTINGS)) {
    if (Object.hasOwn(input, field)) value[field] = collect(errors, `registration.${field}`, normalise(input[field]))
  }
  return { value, errors }
}

export function normaliseEventRequestInput(input = {}) {
  const errors = {}
  const coreInput = input.core ?? {}
  const venueInput = input.venue ?? {}
  const equipmentInput = input.equipment ?? {}
  const registrationInput = input.registration ?? {}
  const registrationSettings = normaliseRegistrationSettings({ opensAt: null, closesAt: null, capacity: null, ...registrationInput })
  Object.assign(errors, registrationSettings.errors)

  const eventRequest = {
    core: {
      title: collect(errors, 'core.title', textOrNull(coreInput.title, MAX_SHORT_TEXT_LENGTH)),
      purpose: collect(errors, 'core.purpose', textOrNull(coreInput.purpose)),
      description: collect(errors, 'core.description', textOrNull(coreInput.description)),
      preferredDateTime: collect(errors, 'core.preferredDateTime', dateTimeOrNull(coreInput.preferredDateTime)),
      durationHours: collect(errors, 'core.durationHours', positiveNumberOrNull(coreInput.durationHours)),
      expectedAttendees: collect(errors, 'core.expectedAttendees', positiveIntegerOrNull(coreInput.expectedAttendees)),
    },
    venue: {
      layoutPreference: collect(errors, 'venue.layoutPreference', textOrNull(venueInput.layoutPreference)),
      accessibilityRequired: booleanOrFalse(venueInput.accessibilityRequired),
      accessibilityNeeds: collect(errors, 'venue.accessibilityNeeds', textOrNull(venueInput.accessibilityNeeds)),
    },
    equipment: {
      requirements: collect(errors, 'equipment.requirements', stringList(equipmentInput.requirements)),
      technicalSupportNeeded: booleanOrFalse(equipmentInput.technicalSupportNeeded),
    },
    registration: {
      enabled: booleanOrFalse(registrationInput.enabled),
      notes: collect(errors, 'registration.notes', textOrNull(registrationInput.notes)),
      ...registrationSettings.value,
    },
  }
  // SPM-19: opens before it closes, closes by the event start. The venue capacity is unknown before booking.
  for (const [path, message] of Object.entries(registrationSettingsErrors(eventRequest.registration, eventRequest.core))) {
    errors[path] ??= message
  }

  return { eventRequest, errors }
}

export function buildDraftEventRequest(input, organiser, now = new Date()) {
  const { eventRequest, errors } = normaliseEventRequestInput(input)

  if (!organiser?.uid) errors.ownerUid = 'An authenticated Event Organiser is required.'

  return {
    request: {
      status: DRAFT,
      ownerUid: organiser?.uid,
      organisationId: organiser?.organisationId ?? null,
      organisationName: organiser?.organisationName ?? null,
      assignedStaffUids: [],
      // SPM-68: the Event Coordinator Lead assigns a coordinator after submission, never while it is a draft.
      assignedCoordinatorUid: null,
      ...eventRequest,
      internal: { planningNotes: '' },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    errors,
  }
}

export function buildDraftEventRequestUpdate(input, now = new Date()) {
  const { eventRequest, errors } = normaliseEventRequestInput(input)

  return {
    update: {
      ...eventRequest,
      updatedAt: now.toISOString(),
    },
    errors,
  }
}

export function validateEventRequestSubmission(input = {}) {
  const { eventRequest, errors } = normaliseEventRequestInput(input)

  const requiredFields = [
    ['core.title', eventRequest.core.title],
    ['core.purpose', eventRequest.core.purpose],
    ['core.expectedAttendees', eventRequest.core.expectedAttendees],
    ['core.durationHours', eventRequest.core.durationHours],
    ['core.preferredDateTime', eventRequest.core.preferredDateTime],
    ['venue.layoutPreference', eventRequest.venue.layoutPreference],
  ]

  for (const [path, value] of requiredFields) {
    if (errors[path]) continue
    if (value === null || value === undefined || value === '') {
      errors[path] = 'Required before submission.'
    }
  }

  return { eventRequest, errors }
}

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0
}
