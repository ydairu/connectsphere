import { spawnSync } from 'node:child_process'

// Cross-platform environment flag; this script itself never starts or contacts a live project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Start the local SPM-14 Firestore emulator first.')
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/spm-14/integration/venueBooking.emulator.test.js', '--reporter=default', '--reporter=json', '--outputFile=test-results/spm14-emulator.json'], {
  stdio: 'inherit', env: { ...process.env, SPM14_EMULATOR: '1' },
})
process.exit(result.status ?? 1)
