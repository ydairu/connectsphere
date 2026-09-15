// Pure planning logic for migrate-user-roles.js — no Firebase, no I/O, so it is testable offline.
//
// SPM-42: users/{uid} moves from `role: string` to `roles: string[]` (Clarification 2: a staff member
// may hold several roles), and organiser accounts gain `organisationId` + `organisationName`, because
// organisation scoping reads the company ID (Clarification 1, Accounts & Registration).

import { ORGANISER, ROLES } from '../../shared/permissions.js'

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Plans the change for one users/{uid} document.
 *
 * @param {string} uid
 * @param {object} data           the document as stored
 * @param {object} organisations  { [uid or lower-cased email]: { organisationId, organisationName } }
 * @returns {{ uid, email, update: object, problems: string[] }}  `update` is {} when nothing changes
 *
 * Rules:
 *  - `roles` is derived from `role` only when `roles` is absent. An existing array is never touched.
 *  - The legacy `role` field is kept, so branches still reading it keep working mid-sprint.
 *  - Role values are copied as stored. Nothing is mapped or renamed; unrecognised values are reported.
 *  - An organisation is only ever taken from the operator-supplied file. No placeholder is written: a
 *    shared placeholder ID would put every unmapped organiser into the same organisation's scope.
 *  - Existing organisation values are never overwritten; a disagreeing file entry is reported.
 */
export function planUserMigration(uid, data, organisations = {}) {
  const update = {}
  const problems = []

  if (data.roles === undefined) {
    if (typeof data.role === 'string') update.roles = [data.role]
    else problems.push('has neither `roles` nor a string `role` — roles left unset')
  } else if (!Array.isArray(data.roles)) {
    problems.push(`\`roles\` is present but is not an array (${typeof data.roles}) — left unchanged`)
  }

  const roles = update.roles ?? (Array.isArray(data.roles) ? data.roles : [])
  const unrecognised = roles.filter((role) => !ROLES.includes(role))
  if (unrecognised.length > 0) {
    problems.push(`unrecognised role value(s) ${JSON.stringify(unrecognised)} — copied as stored; they grant no access`)
  }

  const entry = organisations[uid] ?? (nonEmptyString(data.email) ? organisations[data.email.toLowerCase()] : undefined)

  if (roles.includes(ORGANISER)) {
    for (const field of ['organisationId', 'organisationName']) {
      const stored = data[field]
      const supplied = entry?.[field]
      if (nonEmptyString(stored)) {
        if (nonEmptyString(supplied) && supplied !== stored) {
          problems.push(`${field} is already ${JSON.stringify(stored)}; file says ${JSON.stringify(supplied)} — not overwritten`)
        }
      } else if (nonEmptyString(supplied)) {
        update[field] = supplied
      } else {
        problems.push(`organiser has no ${field} and the organisations file supplies none — left unset`)
      }
    }
  } else if (entry) {
    problems.push('organisations file has an entry for this account, but it is not an organiser — ignored')
  }

  return { uid, email: data.email ?? null, update, problems }
}

/**
 * Validates and normalises an organisations file: keys are uids or emails (emails matched
 * case-insensitively), values are { organisationId, organisationName }.
 */
export function normaliseOrganisations(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('organisations file must be a JSON object keyed by uid or email')
  }
  const normalised = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!nonEmptyString(value?.organisationId) || !nonEmptyString(value?.organisationName)) {
      throw new Error(`organisations file entry ${JSON.stringify(key)} needs non-empty organisationId and organisationName`)
    }
    normalised[key.includes('@') ? key.toLowerCase() : key] = {
      organisationId: value.organisationId,
      organisationName: value.organisationName,
    }
  }
  return normalised
}
