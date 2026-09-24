// SPM-1 AC1 — authentication errors are turned into messages a user can act on, without leaking
// Firebase error codes. The login page shows exactly these strings.

import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from '../../../frontend/src/utils/authErrors.js'

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

describe('SPM-1 — login error messages (unit)', () => {
  it.each([
    ['auth/invalid-credential', 'Invalid email or password.'],
    ['auth/invalid-email', 'Please enter a valid email address.'],
    ['auth/too-many-requests', 'Too many attempts. Please wait and try again.'],
    ['auth/network-request-failed', 'Unable to connect. Please try again.'],
  ])('spm1_auth_error_%s_maps_to_a_user_message', (code, message) => {
    expect(getAuthErrorMessage({ code })).toBe(message)
  })

  it('spm1_wrong_password_and_unknown_email_share_one_message_so_accounts_cannot_be_enumerated', () => {
    // Firebase reports both as auth/invalid-credential; the message must not say which.
    const message = getAuthErrorMessage({ code: 'auth/invalid-credential' })
    expect(message).not.toMatch(/password (is )?(wrong|incorrect)/i)
    expect(message).not.toMatch(/no account|not found|unregistered/i)
  })

  it.each([
    ['an unmapped Firebase code', { code: 'auth/user-disabled' }],
    ['a plain Error', new Error('boom')],
    ['undefined', undefined],
    ['null', null],
  ])('spm1_unrecognised_error_%s_falls_back_to_the_generic_message', (_label, error) => {
    expect(getAuthErrorMessage(error)).toBe(GENERIC_MESSAGE)
  })

  it('spm1_messages_never_expose_firebase_error_codes', () => {
    for (const code of ['auth/invalid-credential', 'auth/invalid-email', 'auth/nonsense']) {
      expect(getAuthErrorMessage({ code })).not.toContain('auth/')
    }
  })
})
