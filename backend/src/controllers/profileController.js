import { ProfileUpdateError, updateOrganisationName } from '../services/profileService.js'

export function getProfile(req, res) {
  res.json({ user: req.user })
}

export async function updateProfile(req, res, next) {
  try {
    return res.json(await updateOrganisationName(req.body, req.user))
  } catch (error) {
    if (error instanceof ProfileUpdateError) {
      return res.status(error.status).json({ message: error.message, errors: error.errors })
    }
    return next(error)
  }
}
