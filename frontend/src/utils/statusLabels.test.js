// Every status in shared/status.js has a display name (SPM-24: a submitted request is shown with its
// current status). Run with the root `npm test`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { RETURNED, STATUSES } from '../../../shared/status.js'
import { statusLabel } from './statusLabels.js'

describe('SPM-24 — submitted requests are shown with their current status', () => {
  test('Every status in shared/status.js has a display name', () => {
    for (const status of STATUSES) {
      const label = statusLabel(status)
      assert.notEqual(label, status, `${status} has no display name`)
      assert.match(label, /^[A-Z]/, `${status} label should read as a sentence`)
    }
  })

  test('The multi-word status reads as words, not as its stored value', () => {
    assert.equal(statusLabel(RETURNED), 'Returned for clarification')
  })

  test('An unrecognised status is shown as stored rather than mislabelled', () => {
    assert.equal(statusLabel('some_future_status'), 'some_future_status')
  })
})
