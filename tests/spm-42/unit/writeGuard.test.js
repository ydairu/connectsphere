// Safety rail for scripts that write to the real Firebase project.

import { describe, expect, it } from 'vitest'

import { resolveWriteMode } from '../../../backend/scripts/writeGuard.js'

const PROJECT = 'connectsphere-real'

describe('Write guard for seed and migration scripts', () => {
  it('No flags is a dry run', () => {
    expect(resolveWriteMode({ write: false }, PROJECT)).toEqual({ ok: true, write: false })
  })

  it('--write without --project is refused', () => {
    const mode = resolveWriteMode({ write: true }, PROJECT)
    expect(mode.ok).toBe(false)
    expect(mode.message).toMatch(/--project=connectsphere-real/)
  })

  it('--write with a project ID that does not match the configured project is refused', () => {
    expect(resolveWriteMode({ write: true, project: 'some-other-project' }, PROJECT).ok).toBe(false)
  })

  it('--write with the matching project ID writes', () => {
    expect(resolveWriteMode({ write: true, project: PROJECT }, PROJECT)).toEqual({ ok: true, write: true })
  })

  it('--project without --write is refused rather than silently dry-running', () => {
    expect(resolveWriteMode({ write: false, project: PROJECT }, PROJECT).ok).toBe(false)
  })

  it('Missing FIREBASE_PROJECT_ID is refused even for a dry run', () => {
    expect(resolveWriteMode({ write: false }, undefined).ok).toBe(false)
  })
})
