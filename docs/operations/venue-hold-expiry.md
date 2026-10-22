# Venue hold expiry operations

Tentative venue holds last seven days. An expired hold immediately stops blocking the calendar, search and new booking requests, even if the background task has not run. The task records expiry and sends in-app notices to the assigned Coordinator. See the [SPM-78 acceptance evidence](../evidence/spm-78-traceability.md) and [manual checklist](../testing/spm-78-manual-testing.md) for verification status and test steps.

The [hourly GitHub Actions workflow](../../.github/workflows/venue-hold-expiry.yml) needs the repository secrets `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` on the default branch. Confirm a successful scheduled or manually dispatched run before relying on notices. Delayed or failed runs can delay notices, but do not extend venue availability or the approval deadline.

Before running the task against a project with older holds, review the dry-run backfill report:

```bash
npm run backfill:venue-holds --prefix backend
```

Review proposed deadlines and unresolved records. To apply the reviewed changes, run:

```bash
npm run backfill:venue-holds --prefix backend -- --write
```

The backfill does not change existing valid deadlines. To run the expiry task directly, use `npm run process:venue-holds --prefix backend`. Reruns are safe. The automated checks include `npm run test:spm78`; this does not verify a successful run against a deployed Firebase project.
