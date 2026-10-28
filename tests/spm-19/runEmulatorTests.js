import { spawnSync } from 'node:child_process'

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Start the isolated local SPM-19 Firestore emulator first.')
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/spm-19/registration.emulator.test.js'], {
  stdio: 'inherit', env: { ...process.env, SPM19_EMULATOR: '1' },
})
process.exit(result.status ?? 1)
