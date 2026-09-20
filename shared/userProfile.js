import { ORGANISER } from './permissions.js'

export function organisationNameError(value) {
  return typeof value === 'string' && value.trim()
    ? ''
    : 'Organisation name is required.'
}

export function buildRegistrationProfile({ name, email, role, organisationName }) {
  if (![ORGANISER, 'attendee'].includes(role)) {
    throw new Error('Invalid registration role.')
  }
  // Keep the legacy role field until all consumers have migrated to roles[].
  const profile = { name, email, role, roles: [role] }
  if (role === ORGANISER) {
    const error = organisationNameError(organisationName)
    if (error) {
      throw Object.assign(new Error(error), { code: 'profile/invalid-organisation' })
    }
    profile.organisationName = organisationName.trim()
  }
  return profile
}
