// SPM-2 AC3/AC6 — the registration rule set that decides which roles may self-register and what is
// persisted. buildRegistrationProfile is shared code: AuthContext.register calls it before any
// Firebase account is created, so these rules are the application's first line of enforcement.

import { describe, expect, it } from 'vitest'
import { ATTENDEE, ORGANISER, ROLES } from '../../../shared/permissions.js'
import { buildRegistrationProfile, organisationNameError } from '../../../shared/userProfile.js'
import {
  ATTENDEE_REGISTRATION,
  INTERNAL_ROLES,
  ORGANISER_REGISTRATION,
  PUBLIC_ROLES,
  UNSUPPORTED_ACCOUNT_TYPES,
  internalRoleRegistration,
} from '../fixtures/registrations.js'

describe('SPM-2 — registration profile rules (unit)', () => {
  it('spm2_attendee_receives_correct_role', () => {
    expect(buildRegistrationProfile(ATTENDEE_REGISTRATION)).toEqual({
      name: ATTENDEE_REGISTRATION.name,
      email: ATTENDEE_REGISTRATION.email,
      role: ATTENDEE,
      roles: [ATTENDEE],
    })
  })

  it('spm2_event_organiser_receives_correct_role_and_trimmed_organisation', () => {
    expect(buildRegistrationProfile({ ...ORGANISER_REGISTRATION, organisationName: '  Example Events Ltd  ' })).toEqual({
      name: ORGANISER_REGISTRATION.name,
      email: ORGANISER_REGISTRATION.email,
      role: ORGANISER,
      roles: [ORGANISER],
      organisationName: 'Example Events Ltd',
    })
  })

  it.each([undefined, null, '', '   ', 42])('spm2_event_organiser_requires_organisation_(%j_is_rejected)', (organisationName) => {
    expect(organisationNameError(organisationName)).toBe('Organisation name is required.')
    expect(() => buildRegistrationProfile({ ...ORGANISER_REGISTRATION, organisationName })).toThrow(
      expect.objectContaining({ code: 'profile/invalid-organisation', message: 'Organisation name is required.' }),
    )
  })

  it.each([undefined, '', 'Ignored Org'])('spm2_attendee_registration_does_not_require_or_store_organisation_(%j)', (organisationName) => {
    const profile = buildRegistrationProfile({ ...ATTENDEE_REGISTRATION, organisationName })
    expect(profile.roles).toEqual([ATTENDEE])
    expect(profile).not.toHaveProperty('organisationName')
  })

  it.each(INTERNAL_ROLES)('spm2_%s_cannot_self_register', (role) => {
    expect(() => buildRegistrationProfile(internalRoleRegistration(role))).toThrow('Invalid registration role.')
  })

  it.each(UNSUPPORTED_ACCOUNT_TYPES)('spm2_unsupported_account_type_%j_is_rejected', (role) => {
    expect(() => buildRegistrationProfile({ ...ATTENDEE_REGISTRATION, role })).toThrow('Invalid registration role.')
  })

  it('spm2_public_registration_roles_are_exactly_event_organiser_and_attendee', () => {
    const accepted = ROLES.filter((role) => {
      try {
        buildRegistrationProfile({ ...ORGANISER_REGISTRATION, role })
        return true
      } catch {
        return false
      }
    })
    expect(accepted.sort()).toEqual([...PUBLIC_ROLES].sort())
  })

  it('spm2_manipulated_registration_cannot_inject_privileged_profile_fields', () => {
    const profile = buildRegistrationProfile({
      ...ORGANISER_REGISTRATION,
      roles: ['coordinator', 'organiser'],
      organisationId: 'SOMEONE-ELSES-ORG',
      seedTag: 'fake',
      admin: true,
    })
    expect(profile.roles).toEqual([ORGANISER])
    expect(profile).not.toHaveProperty('organisationId')
    expect(profile).not.toHaveProperty('seedTag')
    expect(profile).not.toHaveProperty('admin')
  })
})
