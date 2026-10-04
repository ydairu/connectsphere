// SPM-28 — which activity documents seed.js may delete. Pure, so the guardrails are tested offline
// (tests/spm-28/unit/seedHistory.test.js); seed.js only applies the result.
//
// A document is removable only when ALL of these hold:
//   1. the run has --write;
//   2. its parent is a seeded request ID;
//   3. its type is field_changed;
//   4. it is not one of the SEED_FIELD_HISTORY entries.
// Nothing else — no other activity type, nothing under a request this seed did not create — is ever removed.

import { FIELD_CHANGED } from '../../shared/changeHistory.js'
import { SEED_FIELD_HISTORY, SEED_REQUESTS } from './seedData.js'

const SEEDED_REQUEST_IDS = new Set(SEED_REQUESTS.map((request) => request.id))
const SEEDED_ENTRY_IDS = new Set(Object.values(SEED_FIELD_HISTORY).flat().map((entry) => entry.id))

/**
 * @param {object} options
 * @param {boolean} options.write  the run has --write
 * @param {string} options.requestId  the parent request's id
 * @param {{ id: string, type?: string }[]} options.entries  its activity documents (id and data)
 * @returns {string[]} the ids that may be deleted
 */
export function removableFieldHistory({ write, requestId, entries }) {
  if (write !== true) return []
  if (!SEEDED_REQUEST_IDS.has(requestId)) return []
  return entries.filter((entry) => entry.type === FIELD_CHANGED && !SEEDED_ENTRY_IDS.has(entry.id)).map((entry) => entry.id)
}
