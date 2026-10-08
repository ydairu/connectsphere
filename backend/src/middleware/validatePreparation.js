// SPM-48 — validates the preparation sections of PATCH /api/requests/:id.
//
// Runs after authoriseWrite, so a field the user may not edit is refused with 403 before its value is
// looked at. An invalid status or notes value is refused with 400 and nothing is written. Only the
// preparation sections are checked; validating the other sections is SPM-10 (AGENTS.md §6, known gap).

import { preparationPatchErrors } from '../../../shared/preparation.js'

export function validatePreparation(req, res, next) {
  const errors = preparationPatchErrors(req.body)
  const fields = Object.keys(errors)
  if (fields.length > 0) {
    return res.status(400).json({ message: `Invalid value for ${fields.join(', ')}`, errors })
  }
  return next()
}
