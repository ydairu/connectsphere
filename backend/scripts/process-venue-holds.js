import { getAdminDb } from '../src/config/firebaseAdmin.js'
import { processVenueHolds } from '../src/services/venueHoldExpiryService.js'

try {
  const result = await processVenueHolds(getAdminDb())
  console.log(JSON.stringify(result))
  if (result.review.length) process.exitCode = 1
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
