import { spawnSync } from 'node:child_process'

// SPM-58 — runs the equipment reservation concurrency tests against the local Firestore emulator started by
// `firebase emulators:exec` (CI, firebase.spm14.json's port). This script never starts or contacts a live project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Start the local Firestore emulator first.')
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/spm-58/integration/equipmentReservation.emulator.test.js', '--reporter=default', '--reporter=json', '--outputFile=test-results/spm58-emulator.json'], {
  stdio: 'inherit', env: { ...process.env, SPM58_EMULATOR: '1' },
})
process.exit(result.status ?? 1)
