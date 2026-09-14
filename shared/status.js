// Event request status constants — SPM-42, SPM-24, SPM-3.
//
// Import these; never type a status string literal. "Draft" vs "draft" silently leaks every draft
// into the coordinator's list (CLAUDE.md, Hard rules).
//
// Lifecycle — customer-rulings.md, "Event status lifecycle":
//   Draft → [Requested | Submitted] → Under Review → Planning → Confirmed → Completed / Cancelled / Rejected

// Drafts are strictly private until submitted, with no expiry.
// — Clarification 2, Drafts. Drives SPM-24's last criterion.
export const DRAFT = 'draft'

// ⚠️ UNRESOLVED NAME. Session 1 transcript: "requested". Session 2 summary: "Submitted".
// Provisionally SUBMITTED because both precedence rules in customer-rulings.md point the same way:
// session 2 overrules session 1, and the written record overrules the verbal transcript. SPM-3's card
// also says "Submitted". The team still has to ratify this in sprint planning and record it.
// Draft queries must test `status === DRAFT` only, so SPM-24 is unaffected if this is renamed.
export const SUBMITTED = 'submitted'

export const UNDER_REVIEW = 'under_review'
export const PLANNING = 'planning'

// "Approved and confirmed are the same thing. There is no separate approved state."
// — customer-rulings.md, Event status lifecycle. Do not add an APPROVED constant.
export const CONFIRMED = 'confirmed'

export const COMPLETED = 'completed'

// Cancellation happens after an event is confirmed. — customer-rulings.md
export const CANCELLED = 'cancelled'

// Rejection happens during review/planning when requirements can't be met. — customer-rulings.md
export const REJECTED = 'rejected'

// "After an event is submitted, the organizer cannot edit it unless the coordinator requests
// clarification or changes." — Clarification 2, Role Permissions & Access.
// The customer did not rule whether "returned" is a status or a flag. It is modelled as a status here
// because the plan's state-gate table treats it as one. A returned request keeps its original
// reference and re-enters review on resubmission, i.e. it goes back to SUBMITTED.
export const RETURNED = 'returned_for_clarification'

export const STATUSES = Object.freeze([
  DRAFT,
  SUBMITTED,
  UNDER_REVIEW,
  PLANNING,
  CONFIRMED,
  COMPLETED,
  CANCELLED,
  REJECTED,
  RETURNED,
])
