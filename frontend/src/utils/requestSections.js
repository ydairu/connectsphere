import { CORE, EQUIPMENT, EQUIPMENT_PREPARATION, INTERNAL, REGISTRATION, VENUE, VENUE_PREPARATION } from '../../../shared/permissions.js'
import { PREPARATION_NOT_EVENT_ASSIGNEE } from '../../../shared/preparationAccess.js'
import {
  PREPARATION_EVENT_CLOSED,
  PREPARATION_NOTES_MAX_LENGTH,
  PREPARATION_NOT_STARTED_YET,
  PREPARATION_STATUSES,
  PREPARATION_STATUS_LABELS,
} from '../../../shared/preparation.js'

// How each section of an event request is labelled and edited. Field names match
// normaliseEventRequestInput in shared/eventRequest.js, which is what the API validates on the draft
// routes; `internal` is staff-only and has no draft form.
//
// A section the user may not view never reaches the browser (projectRequest), and a section they may
// not edit is rendered read-only, so this file describes presentation only — never permission.
//
// A field may set `options` ([{ value, label }], for a 'select'), `maxLength`, `keepEmpty` (an emptied
// text field is saved as '' rather than null — the preparation notes must be text, SPM-48), and
// `shortLabel` (used after the section title in the change history, where the full label would repeat it).

const PREPARATION_STATUS_OPTIONS = PREPARATION_STATUSES.map((value) => ({ value, label: PREPARATION_STATUS_LABELS[value] }))

// Labels name the section, so a user who sees both cards (Coordinator, venue + technical staff) gets
// distinct field labels.
function preparationFields(title) {
  return [
    { name: 'status', label: `${title} status`, shortLabel: 'Status', type: 'select', options: PREPARATION_STATUS_OPTIONS },
    { name: 'notes', label: `${title} notes`, shortLabel: 'Notes', type: 'textarea', keepEmpty: true, maxLength: PREPARATION_NOTES_MAX_LENGTH },
  ]
}
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
      // SPM-13: chosen by the assigned Coordinator from catalogue values in the Venue suitability card, not
      // in this section's form. Defined here so the change history can name them.
      { name: 'requiredFacilities', label: 'Required facilities', type: 'list', pageEditor: false },
      { name: 'requiredAccessibilityFeatures', label: 'Required accessibility features', type: 'list', pageEditor: false },
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
      // SPM-19: the period and capacity the Organiser sets; the API checks them (shared/registration.js).
      { name: 'opensAt', label: 'Registration opens', shortLabel: 'Opens', type: 'datetime' },
      { name: 'closesAt', label: 'Registration closes', shortLabel: 'Closes', type: 'datetime' },
      { name: 'capacity', label: 'Registration capacity', shortLabel: 'Capacity', type: 'number' },
      // SPM-59: whether Attendees may withdraw, and until when (the event start when not set).
      { name: 'withdrawalAllowed', label: 'Attendees may withdraw', shortLabel: 'Withdrawal allowed', type: 'boolean' },
      { name: 'withdrawalClosesAt', label: 'Withdrawal closes', shortLabel: 'Withdrawal closes', type: 'datetime' },
      { name: 'notes', label: 'Registration notes', type: 'textarea' },
    ],
  },
  [INTERNAL]: {
    title: 'Internal planning',
    fields: [{ name: 'planningNotes', label: 'Planning notes', type: 'textarea' }],
  },
  // SPM-48: staff and Coordinator only; the API never sends these to an Organiser or Attendee.
  [VENUE_PREPARATION]: { title: 'Venue preparation', fields: preparationFields('Venue preparation') },
  [EQUIPMENT_PREPARATION]: { title: 'Equipment preparation', fields: preparationFields('Equipment preparation') },
})

// Canonical order, so sections appear in the same order for every role — a role simply sees fewer.
export const SECTION_ORDER = Object.freeze([CORE, VENUE, EQUIPMENT, REGISTRATION, INTERNAL, VENUE_PREPARATION, EQUIPMENT_PREPARATION])

// SPM-48: why a preparation section is read-only for the staff who edit it. The reason comes from the API
// (`preparation` in the response), which takes it from shared/preparation.js.
export function preparationReadOnlyText(section, reason) {
  switch (reason) {
    case PREPARATION_EVENT_CLOSED:
      return 'This event is closed.'
    case PREPARATION_NOT_STARTED_YET:
      return 'Available once the event is in Preparation.'
    case PREPARATION_NOT_EVENT_ASSIGNEE:
      return 'Only the event’s assigned staff member can update this section.'
    default:
      return null
  }
}

/** The label for a 'select' field's stored value, or the value itself if it is not an option. */
export function optionLabel(field, value) {
  return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function sectionTitle(section) {
  return SECTION_FIELDS[section]?.title ?? section
}

/** The fields the request page's section form shows and edits. */
export function sectionFields(section) {
  return (SECTION_FIELDS[section]?.fields ?? []).filter((field) => field.pageEditor !== false)
}
