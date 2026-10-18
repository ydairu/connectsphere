// Defaults for a new request or replacement; saved bookings retain their own snapshots.
export function venueBookingRequirements(event) {
  return [event?.venue?.layoutPreference, event?.venue?.accessibilityNeeds]
    .filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()).join('\n')
}
