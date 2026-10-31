import { SECTION_FIELDS, optionLabel, sectionTitle } from './requestSections.js'

// SPM-28 — how change history entries are shown. Presentation only: which entries a user receives is
// decided by the API (shared/changeHistory.js).

export const EMPTY_VALUE = '—'

function fieldDefinition(path) {
  const [section, name] = String(path).split('.')
  return { section, name, definition: SECTION_FIELDS[section]?.fields.find((field) => field.name === name) ?? null }
}

/** "Event details · Title" for core.title; the raw path for a field the page does not define. */
export function fieldLabel(path, venueName = null) {
  if (path === 'primaryVenue') return 'Primary venue'
  // SPM-87: the Coordinator's choice after a significant change (old value: what changed; new: what went back).
  if (path === 'signOffReapproval') return 'Sign-offs sent back for re-approval'
  if (String(path).startsWith('venuePreparation.') && String(path).split('.').length === 3) {
    const field = String(path).split('.')[2]
    return `Venue preparation · ${venueName ?? 'Venue'} · ${field === 'status' ? 'Status' : 'Notes'}`
  }
  const { section, definition } = fieldDefinition(path)
  return definition ? `${sectionTitle(section)} · ${definition.shortLabel ?? definition.label}` : String(path)
}

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** A stored value as text: null "—", arrays comma-separated, booleans Yes/No, date fields formatted, select options by label. */
export function formatHistoryValue(path, value) {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE
  if (path === 'primaryVenue' && typeof value === 'object' && !Array.isArray(value)) return value.venueName ?? EMPTY_VALUE
  if (String(path).startsWith('venuePreparation.') && String(path).endsWith('.status')) return String(optionLabel(SECTION_FIELDS.venuePreparation.fields[0], value))
  if (Array.isArray(value)) return value.length === 0 ? EMPTY_VALUE : value.map((item) => formatHistoryValue(null, item)).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  if (path && fieldDefinition(path).definition?.type === 'datetime') return formatDateTime(value) ?? String(value)
  // SPM-48: a preparation status is shown by its label, e.g. "In Progress".
  if (path && fieldDefinition(path).definition?.type === 'select') return String(optionLabel(fieldDefinition(path).definition, value))
  return String(value)
}

/** When the change was saved, e.g. "4 Oct 2026, 15:20", or "—" if unknown. */
export function formatHistoryTime(at) {
  return formatDateTime(at) ?? EMPTY_VALUE
}
