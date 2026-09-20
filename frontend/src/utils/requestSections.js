import { CORE, EQUIPMENT, INTERNAL, REGISTRATION, VENUE } from '../../../shared/permissions.js'

// How each section of an event request is labelled and edited. Field names match
// normaliseEventRequestInput in shared/eventRequest.js, which is what the API validates on the draft
// routes; `internal` is staff-only and has no draft form.
//
// A section the user may not view never reaches the browser (projectRequest), and a section they may
// not edit is rendered read-only, so this file describes presentation only — never permission.
export const SECTION_FIELDS = Object.freeze({
  [CORE]: {
    title: 'Event details',
    fields: [
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'purpose', label: 'Purpose', type: 'textarea' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'preferredDateTime', label: 'Preferred date and time', type: 'datetime' },
      { name: 'durationHours', label: 'Duration (hours)', type: 'number' },
      { name: 'expectedAttendees', label: 'Expected attendees', type: 'number' },
    ],
  },
  [VENUE]: {
    title: 'Venue',
    fields: [
      { name: 'layoutPreference', label: 'Layout preference', type: 'text' },
      { name: 'accessibilityRequired', label: 'Accessibility required', type: 'boolean' },
      { name: 'accessibilityNeeds', label: 'Accessibility needs', type: 'textarea' },
    ],
  },
  [EQUIPMENT]: {
    title: 'Equipment and technical support',
    fields: [
      { name: 'requirements', label: 'Equipment required (one per line)', type: 'list' },
      { name: 'technicalSupportNeeded', label: 'Technical support needed', type: 'boolean' },
    ],
  },
  [REGISTRATION]: {
    title: 'Registration',
    fields: [
      { name: 'enabled', label: 'Registration enabled', type: 'boolean' },
      { name: 'notes', label: 'Registration notes', type: 'textarea' },
    ],
  },
  [INTERNAL]: {
    title: 'Internal planning',
    fields: [{ name: 'planningNotes', label: 'Planning notes', type: 'textarea' }],
  },
})

// Canonical order, so sections appear in the same order for every role — a role simply sees fewer.
export const SECTION_ORDER = Object.freeze([CORE, VENUE, EQUIPMENT, REGISTRATION, INTERNAL])

export function sectionTitle(section) {
  return SECTION_FIELDS[section]?.title ?? section
}

export function sectionFields(section) {
  return SECTION_FIELDS[section]?.fields ?? []
}
