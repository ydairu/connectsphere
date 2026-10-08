// Arrangement sign-off decisions as recorded on a request — the constants and the read, with no imports.
//
// Split out of shared/arrangements.js (which re-exports everything here) so shared/preparation.js can read
// a sign-off decision without importing arrangements.js. arrangements.js imports permissions.js, and
// permissions.js imports preparation.js (SPM-48), so importing arrangements.js from preparation.js would
// be a circular import that fails at module load.
//
// Decisions are record metadata: arrangementApprovals: { venue?: { decision, byUid, at }, technical?: {...} }

export const VENUE_ARRANGEMENT = 'venue'
export const TECHNICAL_ARRANGEMENT = 'technical'
export const ARRANGEMENTS = Object.freeze([VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT])

export const ARRANGEMENT_APPROVED = 'approved'
export const ARRANGEMENT_REJECTED = 'rejected'
export const ARRANGEMENT_DECISIONS = Object.freeze([ARRANGEMENT_APPROVED, ARRANGEMENT_REJECTED])

/** The recorded decision for one arrangement, or null if none has been made. */
export function arrangementDecision(request, arrangement) {
  return request.arrangementApprovals?.[arrangement]?.decision ?? null
}
