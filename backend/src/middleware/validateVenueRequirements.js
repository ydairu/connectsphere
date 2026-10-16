// SPM-13 — validates the venue requirement fields of PATCH /api/requests/:id: the facilities and
// accessibility features the assigned Coordinator chooses for the suitability check.
//
// Runs after authoriseWrite, so a field the user may not edit is refused with 403 before its value is
// looked at. A value that is not a list of text is refused with 400 and nothing is written; a valid one is
// tidied (trimmed, blanks and duplicates removed) before it is saved.

import { normaliseVenueRequirementsPatch } from '../../../shared/venueSuitability.js'

export function validateVenueRequirements(req, res, next) {
  const { patch, errors } = normaliseVenueRequirementsPatch(req.body)
  const fields = Object.keys(errors)
  if (fields.length > 0) {
    return res.status(400).json({ message: `Invalid value for ${fields.join(', ')}`, errors })
  }
  req.body = patch
  return next()
}
