// Shared safety rail for scripts that write to the real Firebase project.
//
// Default is a dry run. Writing needs BOTH `--write` and `--project=<id>`, where <id> must equal the
// FIREBASE_PROJECT_ID the Admin SDK is configured with. Typing the project ID is the confirmation: it
// stops a script aimed at the wrong .env from writing anywhere.

export function resolveWriteMode({ write, project }, configuredProjectId) {
  if (!configuredProjectId) {
    return { ok: false, message: 'FIREBASE_PROJECT_ID is not set in the root .env — refusing to run.' }
  }
  if (!write) {
    if (project !== undefined) {
      return { ok: false, message: '--project was given without --write. Add --write to apply changes, or drop --project for a dry run.' }
    }
    return { ok: true, write: false }
  }
  if (project === undefined) {
    return { ok: false, message: `--write needs --project=${configuredProjectId} to confirm the target project. Nothing was written.` }
  }
  if (project !== configuredProjectId) {
    return {
      ok: false,
      message: `--project=${project} does not match the configured project ${configuredProjectId}. Nothing was written.`,
    }
  }
  return { ok: true, write: true }
}

export function banner(scriptName, projectId, mode) {
  const line = '─'.repeat(72)
  const description = !mode.ok
    ? 'REFUSED — invalid flags, nothing will be read or written'
    : mode.write
      ? 'WRITE — changes will be applied to this project'
      : 'DRY RUN — nothing will be written'
  return [line, scriptName, `Firebase project: ${projectId ?? '(not configured)'}`, `Mode:             ${description}`, line].join('\n')
}
