import { SECTION_ORDER, sectionFields } from './requestSections.js'

// Form values for one request, and the patch to send back. The patch carries only the fields the user
// actually changed, inside sections they may edit, so a save never rewrites a field it did not touch
// and never sends a section the API would reject (SPM-42 #7).

// A datetime-local input needs 'YYYY-MM-DDTHH:mm' in local time; stored values are ISO strings.
export function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toFieldValue(type, value) {
  switch (type) {
    case 'boolean':
      return value === true
    case 'list':
      return Array.isArray(value) ? value.join('\n') : (value ?? '')
    case 'number':
      return value === null || value === undefined ? '' : String(value)
    case 'datetime':
      return toDateTimeInput(value)
    default:
      return value ?? ''
  }
}

/** Form state for every section the response carried, keyed section → field → input value. */
export function toFormValues(request) {
  const form = {}
  for (const section of SECTION_ORDER) {
    if (!request?.[section]) continue
    form[section] = {}
    for (const { name, type } of sectionFields(section)) {
      form[section][name] = toFieldValue(type, request[section][name])
    }
  }
  return form
}

function toStoredValue({ type, keepEmpty }, value) {
  switch (type) {
    case 'boolean':
      return value === true
    case 'list':
      return String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    case 'number': {
      if (value === '' || value === null || value === undefined) return null
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    case 'datetime':
      return value === '' ? null : new Date(value).toISOString()
    case 'select':
      return value
    default: {
      const text = String(value ?? '').trim()
      return text === '' && !keepEmpty ? null : text
    }
  }
}

/**
 * The patch to PATCH /api/requests/:id: only changed fields, only in `editableSections`.
 * Comparison runs on input values, so a value the user never touched can never be counted as changed.
 */
export function buildPatch(request, form, editableSections = []) {
  const original = toFormValues(request)
  const patch = {}

  for (const section of SECTION_ORDER) {
    if (!editableSections.includes(section) || !form?.[section]) continue
    for (const field of sectionFields(section)) {
      const { name } = field
      const current = form[section][name]
      if (current === original[section]?.[name]) continue
      patch[section] = patch[section] ?? {}
      patch[section][name] = toStoredValue(field, current)
    }
  }

  return patch
}

export function hasChanges(patch) {
  return Object.keys(patch).length > 0
}
