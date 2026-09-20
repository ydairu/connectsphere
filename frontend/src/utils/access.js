// Presentation-side role check for routes. The API and firestore.rules remain the enforcement: this
// only decides what the browser renders, so a user who reaches a page anyway still gets 401/403 from
// the API (SPM-42: "an interface-level restriction alone does not satisfy this criterion").
//
// A route with no allowedRoles is open to any signed-in user. Otherwise ANY one of the user's roles
// being allowed is enough — a multi-role user receives the union of their roles' access (SPM-42).
export function isRouteAllowed(roles = [], allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return true
  return roles.some((role) => allowedRoles.includes(role))
}
