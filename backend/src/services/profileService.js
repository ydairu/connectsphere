import { ORGANISER, rolesOf } from '../../../shared/permissions.js'
import { organisationNameError } from '../../../shared/userProfile.js'
import { getAdminDb } from '../config/firebaseAdmin.js'

export class ProfileUpdateError extends Error {
  constructor(status, message, errors) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export async function updateOrganisationName(input, user, db) {
  if (!user?.uid) throw new ProfileUpdateError(401, 'Unauthorized')
  if (!rolesOf(user).includes(ORGANISER)) throw new ProfileUpdateError(403, 'Forbidden')

  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => key !== 'organisationName')) {
    throw new ProfileUpdateError(400, 'Only organisationName can be updated.')
  }
  const error = organisationNameError(input.organisationName)
  if (error) {
    throw new ProfileUpdateError(400, 'Validation failed', { organisationName: error })
  }

  const update = { organisationName: input.organisationName.trim() }
  // Never accept a target UID or spread request fields into a profile write.
  // update() also prevents recreating a profile deleted since authentication.
  await (db ?? getAdminDb()).collection('users').doc(user.uid).update(update)
  return update
}
