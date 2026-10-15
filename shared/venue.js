const MAX_SHORT_TEXT_LENGTH = 160
const MAX_LONG_TEXT_LENGTH = 2000
const MAX_LIST_ITEM_LENGTH = 120

function requiredText(value, maxLength = MAX_LONG_TEXT_LENGTH) {
  if (value === undefined || value === null) return { error: 'Required.' }
  if (typeof value !== 'string') return { error: 'Must be text.' }

  const trimmed = value.trim()
  if (!trimmed) return { error: 'Required.' }
  if (trimmed.length > maxLength) return { error: `Must be ${maxLength} characters or fewer.` }
  return { value: trimmed }
}

function positiveIntegerRequired(value) {
  if (value === undefined || value === null || value === '') return { error: 'Required.' }
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) return { error: 'Must be a positive whole number.' }
  return { value: number }
}

// SPM-72: setup and turnaround are whole minutes, 0 or more, with no maximum (CL3 row 28). Left out,
// they default to 0; a value that was sent must be valid, so a blank field is not read as 0.
function bufferMinutes(value) {
  if (value === undefined) return { value: 0 }
  if (typeof value === 'string' && value.trim() === '') return { error: 'Required. Enter 0 if none is needed.' }

  const number = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) {
    return { error: 'Must be a whole number of minutes, 0 or more.' }
  }
  return { value: number }
}

function requiredStringList(value) {
  if (value === undefined || value === null || value === '') return { error: 'Required.' }

  let items
  if (Array.isArray(value)) {
    items = value
  } else if (typeof value === 'string') {
    items = value.split('\n')
  } else {
    return { error: 'Must be text or a list of text values.' }
  }

  const normalised = []
  for (const item of items) {
    if (typeof item !== 'string') return { error: 'Must contain only text values.' }
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > MAX_LIST_ITEM_LENGTH) return { error: `Each item must be ${MAX_LIST_ITEM_LENGTH} characters or fewer.` }
    normalised.push(trimmed)
  }

  if (normalised.length === 0) return { error: 'Required.' }
  return { value: normalised }
}

function collect(errors, path, result) {
  if (result.error) errors[path] = result.error
  return result.value
}

export function normaliseVenueInput(input = {}) {
  const errors = {}

  const venue = {
    name: collect(errors, 'name', requiredText(input.name, MAX_SHORT_TEXT_LENGTH)),
    location: collect(errors, 'location', requiredText(input.location)),
    maximumCapacity: collect(errors, 'maximumCapacity', positiveIntegerRequired(input.maximumCapacity)),
    facilities: collect(errors, 'facilities', requiredStringList(input.facilities)),
    accessibilityFeatures: collect(errors, 'accessibilityFeatures', requiredStringList(input.accessibilityFeatures)),
    supportedLayouts: collect(errors, 'supportedLayouts', requiredStringList(input.supportedLayouts)),
    operatingHours: collect(errors, 'operatingHours', requiredText(input.operatingHours)),
    setupMinutes: collect(errors, 'setupMinutes', bufferMinutes(input.setupMinutes)),
    turnaroundMinutes: collect(errors, 'turnaroundMinutes', bufferMinutes(input.turnaroundMinutes)),
  }

  return { venue, errors }
}

export function buildVenueRecord(input, venueStaff, now = new Date()) {
  const { venue, errors } = normaliseVenueInput(input)

  if (!venueStaff?.uid) errors.createdByUid = 'An authenticated Venue Staff member is required.'

  return {
    venue: {
      ...venue,
      createdByUid: venueStaff?.uid,
      createdByName: venueStaff?.name ?? venueStaff?.email ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    errors,
  }
}

export function hasVenueValidationErrors(errors) {
  return Object.keys(errors).length > 0
}
