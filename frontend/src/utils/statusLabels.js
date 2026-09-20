import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
  PLANNING,
  REJECTED,
  RETURNED,
  SUBMITTED,
  UNDER_REVIEW,
} from '../../../shared/status.js'

// Display names for the statuses in shared/status.js. Statuses are never typed as string literals
// anywhere; this map is the only place a status meets its wording.
const STATUS_LABELS = {
  [DRAFT]: 'Draft',
  [SUBMITTED]: 'Submitted',
  [UNDER_REVIEW]: 'Under review',
  [PLANNING]: 'Planning',
  [CONFIRMED]: 'Confirmed',
  [COMPLETED]: 'Completed',
  [CANCELLED]: 'Cancelled',
  [REJECTED]: 'Rejected',
  [RETURNED]: 'Returned for clarification',
}

// An unrecognised value is shown as stored rather than mislabelled as some other status. The name of
// the status after Draft is not ratified yet, so a rename must not silently become "Unknown" here.
export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}
