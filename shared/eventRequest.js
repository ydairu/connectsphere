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

export function normaliseEventRequestInput(input = {}) {
  const errors = {}
  const coreInput = input.core ?? {}
  const venueInput = input.venue ?? {}
  const equipmentInput = input.equipment ?? {}
  const registrationInput = input.registration ?? {}

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
    },
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

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0
}
