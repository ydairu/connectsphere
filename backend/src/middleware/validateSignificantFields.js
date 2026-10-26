// SPM-10 — the significant fields of PATCH /api/requests/:id.
//
// validateSignificantFields runs after authoriseWrite, so a field the user may not edit is a 403 before its
// value is looked at. It validates and normalises the significant fields only (shared/significantChanges.js):
// an invalid value is a 400 naming each field, and nothing is written. A value that means the same as the
// stored one ("80" and 80) is removed from the patch, so it is not a change. Ordinary fields are not
// validated here.
//
// refuseSignificantChangeWhileCancellationOpen runs next: a significant change to a Confirmed event with an
// open cancellation request is a 409 (SPM-10 AC7, team decision); ordinary edits pass.

import {
  CANCELLATION_REQUEST_OPEN,
  CANCELLATION_REQUEST_OPEN_MESSAGE,
  normaliseSignificantPatch,
  significantChangeBlocked,
  significantFieldsIn,
} from '../../../shared/significantChanges.js'
import { PREPARATION } from '../../../shared/status.js'

export function validateSignificantFields(req, res, next) {
  const { patch, errors } = normaliseSignificantPatch(req.eventRequest, req.body)
  const fields = Object.keys(errors)
  if (fields.length > 0) {
    return res.status(400).json({ message: `Invalid value for ${fields.join(', ')}`, errors })
  }
  req.body = patch
  return next()
}

export function refuseSignificantChangeWhileCancellationOpen(req, res, next) {
  const fields = significantFieldsIn(req.body)
  // SPM-87 has not supplied the Preparation re-review path yet. Refuse these edits until it can
  // atomically return the event to Planning and invalidate safety approval; ordinary edits still work.
  if (fields.length > 0 && req.eventRequest.status === PREPARATION) {
    return res.status(409).json({ reason: 'preparation_rereview_unavailable', message: 'Significant changes to a Preparation event require the SPM-87 re-review flow.', significantFields: fields })
  }
  if (fields.length > 0 && significantChangeBlocked(req.eventRequest)) {
    return res.status(409).json({ reason: CANCELLATION_REQUEST_OPEN, message: CANCELLATION_REQUEST_OPEN_MESSAGE, significantFields: fields })
  }
  return next()
}
