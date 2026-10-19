import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { backfillVenueHoldExpiries } from '../src/services/venueHoldBackfillService.js'

const write = process.argv.includes('--write')
if (process.argv.slice(2).some((argument) => argument !== '--write')) {
  console.error('Usage: npm run backfill:venue-holds -- [--write]')
  process.exitCode = 1
} else {
  try {
    const result = await backfillVenueHoldExpiries(getAdminDb(), { write })
    console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', ...result }, null, 2))
    if (result.review.length) process.exitCode = 1
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
