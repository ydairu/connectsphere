const errorMessages = {
  'profile/invalid-organisation': 'Organisation name is required.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/network-request-failed': 'Unable to connect. Please try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/weak-password': 'Password must contain at least 6 characters.',
}

export function getAuthErrorMessage(error) {
  return errorMessages[error?.code] || 'Something went wrong. Please try again.'
}
