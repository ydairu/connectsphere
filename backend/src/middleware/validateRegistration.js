// SPM-19 — validates the registration section of PATCH /api/requests/:id.
//
// Runs after authoriseWrite, so a field the user may not edit is refused with 403 before its value is looked
// at. The period and capacity are checked as they will be saved — the patch over the stored values — against
// the event start and the selected primary venue's capacity, or the largest approved venue when none is selected.
// An invalid value is
// refused with 400 and nothing is written. Valid values are passed on normalised (a capacity of "2" is stored
// as 2). `enabled` and `notes` are not checked here: validating the other fields is the AGENTS.md §6 known gap.

import { normaliseRegistrationSettings } from '../../../shared/eventRequest.js'
import { registrationSettingsErrors } from '../../../shared/registration.js'
import { loadApprovedVenues, registrationVenueContext } from '../services/registrationService.js'

export function createValidateRegistration(getDb) {
  return async function validateRegistration(req, res, next) {
    const patch = req.body.registration
    if (!patch) return next()
    try {
      const { value, errors } = normaliseRegistrationSettings(patch)
      if (Object.keys(errors).length === 0) {
        const existing = req.eventRequest
        const registration = { ...existing.registration, ...value }
        const core = { ...existing.core, ...(req.body.core ?? {}) }
        const approvedVenues = await loadApprovedVenues(getDb(), req.params.id)
        const venueCapacity = registrationVenueContext(existing, approvedVenues).venueCapacity
        Object.assign(errors, registrationSettingsErrors(registration, core, venueCapacity))
      }
      const fields = Object.keys(errors)
      if (fields.length > 0) return res.status(400).json({ message: `Invalid value for ${fields.join(', ')}`, errors })
      Object.assign(patch, value)
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
