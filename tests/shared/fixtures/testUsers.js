// Test accounts for every customer role, shared by SPM-1 (sign in as each role) and SPM-2 (an
// existing account for the duplicate-email criterion; role access after registration).
//
// All credentials are fake. SEED_ACCOUNTS is pure data (uid, email, name, roles, organisation*) whose
// emails use the reserved .test TLD, so nothing here can reach a real inbox or a real Firebase project.

import { SEED_ACCOUNTS } from '../../../backend/scripts/seedData.js'

export const TEST_PASSWORD = 'Sprint1-Test-Password!'

export const ROLE_USERS = Object.freeze({
  organiser: SEED_ACCOUNTS.organiserA1,
  coordinator: SEED_ACCOUNTS.coordinator,
  venueStaff: SEED_ACCOUNTS.venueStaff,
  technicalStaff: SEED_ACCOUNTS.technicalStaff,
  attendee: SEED_ACCOUNTS.attendee,
})

export const ALL_ROLE_USERS = Object.freeze(Object.values(ROLE_USERS))

// Accounts beyond one-per-role, needed by SPM-42 and SPM-24. Kept out of ROLE_USERS so suites that
// iterate the five customer roles are unaffected.
export const EXTRA_USERS = Object.freeze({
  // SPM-42's combined-permissions criterion: one account holding two staff roles.
  venueTechnicalStaff: SEED_ACCOUNTS.venueTechnicalStaff,
  // SPM-24's empty-state criterion: an Organiser who owns nothing.
  organiserWithoutRequests: SEED_ACCOUNTS.organiserA3,
})

export const ALL_TEST_USERS = Object.freeze([...ALL_ROLE_USERS, ...Object.values(EXTRA_USERS)])

// The users/{uid} document as persisted for an account (everything except the auth uid).
export function profileOf(account) {
  const { uid, ...profile } = account
  void uid
  return { ...profile, role: profile.roles[0] }
}
