import { SECTION_FIELDS, sectionTitle } from './requestSections.js'

// SPM-28 — how change history entries are shown. Presentation only: which entries a user receives is
// decided by the API (shared/changeHistory.js).

export const EMPTY_VALUE = '—'

function fieldDefinition(path) {
  const [section, name] = String(path).split('.')
  return { section, name, definition: SECTION_FIELDS[section]?.fields.find((field) => field.name === name) ?? null }
}

/** "Event details · Title" for core.title; the raw path for a field the page does not define. */
export function fieldLabel(path) {
  const { section, definition } = fieldDefinition(path)
  return definition ? `${sectionTitle(section)} · ${definition.label}` : String(path)
}

function formatDateTime(value) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** A stored value as text: null "—", arrays comma-separated, booleans Yes/No, date fields formatted. */
export function formatHistoryValue(path, value) {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE
  if (Array.isArray(value)) return value.length === 0 ? EMPTY_VALUE : value.map((item) => formatHistoryValue(null, item)).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  if (path && fieldDefinition(path).definition?.type === 'datetime') return formatDateTime(value) ?? String(value)
  return String(value)
}

/** When the change was saved, e.g. "4 Oct 2026, 15:20", or "—" if unknown. */
export function formatHistoryTime(at) {
  return formatDateTime(at) ?? EMPTY_VALUE
}
