// Safety rail for scripts that write to the real Firebase project.
// Run: node --test "backend/scripts/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveWriteMode } from './writeGuard.js'

const PROJECT = 'connectsphere-real'

describe('Write guard for seed and migration scripts', () => {
  test('No flags is a dry run', () => {
    assert.deepEqual(resolveWriteMode({ write: false }, PROJECT), { ok: true, write: false })
  })

  test('--write without --project is refused', () => {
    const mode = resolveWriteMode({ write: true }, PROJECT)
    assert.equal(mode.ok, false)
    assert.match(mode.message, /--project=connectsphere-real/)
  })

  test('--write with a project ID that does not match the configured project is refused', () => {
    assert.equal(resolveWriteMode({ write: true, project: 'some-other-project' }, PROJECT).ok, false)
  })

  test('--write with the matching project ID writes', () => {
    assert.deepEqual(resolveWriteMode({ write: true, project: PROJECT }, PROJECT), { ok: true, write: true })
  })

  test('--project without --write is refused rather than silently dry-running', () => {
    assert.equal(resolveWriteMode({ write: false, project: PROJECT }, PROJECT).ok, false)
  })

  test('Missing FIREBASE_PROJECT_ID is refused even for a dry run', () => {
    assert.equal(resolveWriteMode({ write: false }, undefined).ok, false)
  })
})
