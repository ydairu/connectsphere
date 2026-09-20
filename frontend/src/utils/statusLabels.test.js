// Every status in shared/status.js has a display name (SPM-24: a submitted request is shown with its
// current status). Run with `npm test` (Vitest, via the root script).

import { describe, expect, it } from 'vitest'

import { RETURNED, STATUSES } from '../../../shared/status.js'
import { statusLabel } from './statusLabels.js'

describe('SPM-24 — submitted requests are shown with their current status', () => {
  it('Every status in shared/status.js has a display name', () => {
    for (const status of STATUSES) {
      const label = statusLabel(status)
      expect(label, `${status} has no display name`).not.toBe(status)
      expect(label, `${status} label should read as a sentence`).toMatch(/^[A-Z]/)
    }
  })

  it('The multi-word status reads as words, not as its stored value', () => {
    expect(statusLabel(RETURNED)).toBe('Returned for clarification')
  })

  it('An unrecognised status is shown as stored rather than mislabelled', () => {
    expect(statusLabel('some_future_status')).toBe('some_future_status')
  })
})
