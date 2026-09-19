// SPM-2 organisation registration criterion; approved profile-name editing scope.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistrationProfile, organisationNameError } from './userProfile.js'

const registration = { name: 'An Organiser', email: 'organiser@example.com', role: 'organiser' }

describe('SPM-2 — organisation name at registration', () => {
  test('builds a profile with the trimmed name and compatible roles', () => {
    assert.deepEqual(buildRegistrationProfile({ ...registration, organisationName: '  Org A  ' }), {
      ...registration, roles: ['organiser'], organisationName: 'Org A',
    })
  })

  test('rejects missing, blank and non-string organisation names', () => {
    for (const value of [undefined, null, '', ' \t\n ', 42, {}, []]) {
      assert.equal(organisationNameError(value), 'Organisation name is required.')
      assert.throws(() => buildRegistrationProfile({ ...registration, organisationName: value }), {
        code: 'profile/invalid-organisation',
      })
    }
  })

  test('attendees do not need or persist organisation details, including after changing the selected role', () => {
    for (const organisationName of [undefined, '', 'Org A']) {
      const profile = buildRegistrationProfile({ ...registration, role: 'attendee', organisationName })
      assert.deepEqual(profile.roles, ['attendee'])
      assert.equal(Object.hasOwn(profile, 'organisationName'), false)
      assert.equal(Object.hasOwn(profile, 'organisationId'), false)
    }
  })

  test('public registration cannot select internal roles or inject protected profile fields', () => {
    assert.throws(() => buildRegistrationProfile({ ...registration, role: 'coordinator' }))
    const profile = buildRegistrationProfile({
      ...registration, organisationName: 'Org A', organisationId: 'other-org', roles: ['coordinator'],
    })
    assert.equal(Object.hasOwn(profile, 'organisationId'), false)
    assert.deepEqual(profile.roles, ['organiser'])
  })
})
